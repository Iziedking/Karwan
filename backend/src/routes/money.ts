import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { sessionAddress } from '../auth/session.js';
import {
  ensureMoneyRailIntent,
  getMoneyRailIntent,
  getMoneyRailIntentByIdempotencyKey,
  listMoneyRailIntentsForOwner,
  updateMoneyRailIntent,
} from '../db/moneyRailIntents.js';
import {
  applyMoneyRailProviderEvent,
  cancelMoneyRailIntent,
  railCapability,
  startMoneyRailIntent,
  type MoneyRailKind,
  type MoneyRailProviderEvent,
} from '../money/railIntent.js';
import { logger } from '../logger.js';

export const moneyRoutes = new Hono();

const railKinds = [
  'gateway_deposit',
  'cctp_deposit',
  'arc_transfer',
  'bank_deposit',
  'card_onramp',
  'bank_withdrawal',
  'card_offramp',
] as const satisfies readonly MoneyRailKind[];

const intentSchema = z.object({
  rail: z.enum(railKinds),
  direction: z.enum(['in', 'out']),
  inputCurrency: z.string().trim().min(3).max(12),
  inputAmountMinor: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  expectedUsdcMicros: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).optional(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  sourceChain: z.string().trim().min(2).max(40).optional(),
  thirdPartyPayer: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

const providerEventSchema = z.discriminatedUnion('kind', [
  z.object({ key: z.string().min(1).max(200), kind: z.literal('submitted'), providerReference: z.string().min(1).max(200) }),
  z.object({ key: z.string().min(1).max(200), kind: z.literal('settlement_pending'), providerReference: z.string().max(200).optional() }),
  z.object({
    key: z.string().min(1).max(200),
    kind: z.literal('settled'),
    providerReference: z.string().min(1).max(200),
    settlementReference: z.string().min(1).max(200),
    movementReference: z.string().max(80).optional(),
  }),
  z.object({ key: z.string().min(1).max(200), kind: z.literal('failed'), failureCode: z.string().min(1).max(120) }),
  z.object({
    key: z.string().min(1).max(200),
    kind: z.literal('refunded'),
    providerReference: z.string().min(1).max(200),
    settlementReference: z.string().min(1).max(200),
  }),
]);

function configuredProviders(): ReadonlySet<string> {
  const values = new Set<string>(['circle-gateway', 'circle-cctp', 'arc-usdc']);
  if (config.FIAT_RAILS_ENABLED && config.BANK_RAIL_PROVIDER) values.add('unconfigured');
  if (config.FIAT_RAILS_ENABLED && config.CARD_RAIL_PROVIDER) values.add('unconfigured');
  return values;
}

function providerForRail(rail: MoneyRailKind): string {
  if (rail === 'bank_deposit' || rail === 'bank_withdrawal') return config.BANK_RAIL_PROVIDER ?? 'unconfigured';
  if (rail === 'card_onramp' || rail === 'card_offramp') return config.CARD_RAIL_PROVIDER ?? 'unconfigured';
  return railCapability(rail, configuredProviders()).provider;
}

function capabilityFor(rail: MoneyRailKind) {
  const capability = railCapability(rail, configuredProviders());
  const fiatConfigured =
    config.FIAT_RAILS_ENABLED &&
    ((rail.startsWith('bank_') && !!config.BANK_RAIL_PROVIDER) ||
      (rail.startsWith('card_') && !!config.CARD_RAIL_PROVIDER));
  return {
    ...capability,
    state: rail.startsWith('bank_') || rail.startsWith('card_')
      ? fiatConfigured ? 'configured' as const : 'unavailable' as const
      : capability.state,
    provider: providerForRail(rail),
  };
}

function publicIntent(intent: Awaited<ReturnType<typeof getMoneyRailIntent>>) {
  if (!intent) return null;
  return {
    id: intent.id,
    rail: intent.rail,
    direction: intent.direction,
    inputCurrency: intent.inputCurrency,
    inputAmountMinor: intent.inputAmountMinor,
    expectedUsdcMicros: intent.expectedUsdcMicros ?? null,
    recipientAddress: intent.recipientAddress ?? null,
    sourceChain: intent.sourceChain ?? null,
    status: intent.status,
    settlementReference: intent.settlementReference ?? null,
    movementReference: intent.movementReference ?? null,
    failureCode: intent.failureCode ?? null,
    version: intent.version,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    completedAt: intent.completedAt ?? null,
    cancelledAt: intent.cancelledAt ?? null,
  };
}

moneyRoutes.get('/capabilities', (c) => {
  return c.json({
    capabilities: railKinds.map((rail) => capabilityFor(rail)),
    settlementHome: 'Arc',
    supportedAsset: 'USDC',
  });
});

moneyRoutes.get('/intents', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ intents: [] });
  const intents = await listMoneyRailIntentsForOwner(owner, Number(c.req.query('limit') ?? 50));
  return c.json({ intents: intents.map(publicIntent) });
});

moneyRoutes.post('/intents', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const parsed = intentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'invalid money movement request' }, 400);
  const capability = capabilityFor(parsed.data.rail);
  if (capability.state === 'unavailable') {
    return c.json({
      error: 'this money rail is not available yet',
      code: 'rail_unavailable',
      rail: parsed.data.rail,
    }, 409);
  }
  try {
    const existing = await getMoneyRailIntentByIdempotencyKey(parsed.data.idempotencyKey);
    if (existing && existing.owner !== owner.toLowerCase()) {
      return c.json({ error: 'that idempotency key belongs to another account' }, 409);
    }
    const ensured = await ensureMoneyRailIntent({
      owner,
      idempotencyKey: parsed.data.idempotencyKey,
      ...(parsed.data.thirdPartyPayer ? { thirdPartyPayer: parsed.data.thirdPartyPayer } : {}),
      rail: parsed.data.rail,
      direction: parsed.data.direction,
      inputCurrency: parsed.data.inputCurrency,
      inputAmountMinor: String(parsed.data.inputAmountMinor),
      ...(parsed.data.expectedUsdcMicros != null
        ? { expectedUsdcMicros: String(parsed.data.expectedUsdcMicros) }
        : {}),
      ...(parsed.data.recipientAddress ? { recipientAddress: parsed.data.recipientAddress } : {}),
      ...(parsed.data.sourceChain ? { sourceChain: parsed.data.sourceChain } : {}),
      provider: providerForRail(parsed.data.rail),
    });
    let intent = ensured.intent;
    if (ensured.created && intent.status === 'created') {
      intent = await updateMoneyRailIntent(intent.id, (current) => startMoneyRailIntent(current));
    }
    return c.json({
      intent: publicIntent(intent),
      created: ensured.created && !existing,
      next: intent.rail === 'bank_deposit' || intent.rail === 'card_onramp'
        ? 'provider_checkout'
        : intent.rail === 'cctp_deposit' || intent.rail === 'gateway_deposit'
          ? 'wallet_or_gateway'
          : 'recipient_confirmation',
    }, ensured.created ? 201 : 200);
  } catch (error) {
    logger.warn({ owner, err: error instanceof Error ? error.message : String(error) }, 'money rail intent rejected');
    return c.json({ error: error instanceof Error ? error.message : 'invalid money movement request' }, 400);
  }
});

moneyRoutes.post('/intents/:id/retry', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const intent = await getMoneyRailIntent(c.req.param('id'));
  if (!intent || intent.owner !== owner.toLowerCase()) return c.json({ error: 'money movement not found' }, 404);
  try {
    const updated = await updateMoneyRailIntent(intent.id, (current) => startMoneyRailIntent(current));
    return c.json({ intent: publicIntent(updated) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'movement cannot be retried' }, 409);
  }
});

moneyRoutes.post('/intents/:id/cancel', async (c) => {
  const owner = sessionAddress(c);
  if (!owner) return c.json({ error: 'sign in first' }, 401);
  const intent = await getMoneyRailIntent(c.req.param('id'));
  if (!intent || intent.owner !== owner.toLowerCase()) return c.json({ error: 'money movement not found' }, 404);
  try {
    const updated = await updateMoneyRailIntent(intent.id, (current) => cancelMoneyRailIntent(current));
    return c.json({ intent: publicIntent(updated) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'movement cannot be cancelled' }, 409);
  }
});

/// Provider callbacks are the only path that can mark a rail complete. The
/// raw body is signed before JSON parsing, and the event key is stored on the
/// intent so retries are harmless. No webhook secret means no provider writes.
moneyRoutes.post('/webhooks/:provider', async (c) => {
  const secret = config.MONEY_RAIL_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'money rail webhooks are not configured' }, 503);
  const signature = c.req.header('x-karwan-signature') ?? '';
  const raw = await c.req.text();
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const valid = /^[0-9a-f]+$/i.test(signature) && signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return c.json({ error: 'invalid webhook signature' }, 401);
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return c.json({ error: 'invalid money rail webhook' }, 400);
  }
  const body = z.object({ intentId: z.string().uuid(), event: providerEventSchema }).safeParse(parsedBody);
  if (!body.success) return c.json({ error: 'invalid money rail webhook' }, 400);
  const intent = await getMoneyRailIntent(body.data.intentId);
  if (!intent) return c.json({ error: 'money rail intent not found' }, 404);
  if (intent.provider !== c.req.param('provider')) return c.json({ error: 'provider does not match intent' }, 409);
  try {
    const updated = await updateMoneyRailIntent(intent.id, (current) => {
      const started = current.status === 'created' ? startMoneyRailIntent(current) : current;
      return applyMoneyRailProviderEvent(started, body.data.event as MoneyRailProviderEvent);
    });
    return c.json({ received: true, duplicate: updated.version === intent.version, intent: publicIntent(updated) });
  } catch (error) {
    logger.error({ intentId: intent.id, provider: intent.provider, err: error instanceof Error ? error.message : String(error) }, 'money rail webhook reconciliation failed');
    return c.json({ error: 'money rail webhook could not be reconciled' }, 409);
  }
});
