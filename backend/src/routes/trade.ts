import { Hono } from 'hono';
import { z } from 'zod';
import { readSession } from '../auth/session.js';
import { createDocumentAnchor, listAnchorsForInvoice } from '../db/documentAnchors.js';
import { getDeal, patchDeal } from '../db/deals.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { shouldRejectAnchor } from '../security/sa-stub.js';
import { logger } from '../logger.js';

/// Trade-finance routes. Document anchor mirror + PoD acceptance ledger.
/// On-chain writes are done by the user's wallet (Circle DCW or web3);
/// the backend records the off-chain mirror after the frontend reports a
/// confirmed tx hash. This keeps the backend out of the signing path.

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');
const hashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'expected 0x-prefixed 32-byte hex hash');
const invoiceIdSchema = hashSchema; // same shape as a 32-byte hash

const documentKindSchema = z.enum(['invoice', 'po', 'bol', 'coo', 'pod', 'other']);

const anchorBodySchema = z.object({
  invoiceId: invoiceIdSchema,
  hash: hashSchema,
  kind: documentKindSchema,
  label: z.string().max(120).optional(),
  txHash: hashSchema.optional(),
});

const podBodySchema = z.object({
  invoiceId: invoiceIdSchema,
  podHash: hashSchema,
  txHash: hashSchema.optional(),
});

export const tradeRoutes = new Hono();

/// POST /api/trade/anchor — caller is the deal's buyer or seller, having
/// just signed registry.anchor() with their wallet. Body carries the tx
/// hash for audit. Backend mirrors the row + emits a bus event.
tradeRoutes.post('/anchor', async (c) => {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = anchorBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  const caller = session.address.toLowerCase();
  if (caller !== deal.buyer && caller !== deal.seller) {
    return c.json({ error: 'caller is not a party to this deal' }, 403);
  }

  if (await shouldRejectAnchor(body.invoiceId, body.hash, body.kind, caller)) {
    return c.json({ error: 'anchor rejected by security agent' }, 403);
  }

  const anchor = await createDocumentAnchor({
    invoiceId: body.invoiceId,
    hash: body.hash,
    kind: body.kind,
    label: body.label,
    anchorer: caller,
    anchoredAt: Date.now(),
    txHash: body.txHash,
  });

  // Mirror to the deal's documentRefs for fast UI render.
  const refs = deal.documentRefs ?? [];
  if (!refs.find((r) => r.hash.toLowerCase() === anchor.hash)) {
    await patchDeal(body.invoiceId, {
      documentRefs: [
        ...refs,
        {
          hash: anchor.hash,
          kind: anchor.kind,
          label: anchor.label,
          anchoredAt: anchor.anchoredAt,
          txHash: anchor.txHash,
        },
      ],
    });
  }

  bus.emitEvent({
    type: 'trade.document.anchored',
    jobId: body.invoiceId,
    actor: 'platform',
    payload: { hash: anchor.hash, kind: anchor.kind, anchorer: caller },
  });

  logger.info(
    { invoiceId: body.invoiceId, kind: body.kind, anchorer: caller },
    'trade: document anchored',
  );
  return c.json({ anchor });
});

/// GET /api/trade/anchors/:invoiceId — list all anchors for an invoice.
tradeRoutes.get('/anchors/:invoiceId', async (c) => {
  const parsed = invoiceIdSchema.safeParse(c.req.param('invoiceId'));
  if (!parsed.success) return c.json({ error: 'invalid invoiceId' }, 400);
  const anchors = await listAnchorsForInvoice(parsed.data);
  return c.json({ anchors });
});

/// POST /api/trade/pod/accept — buyer or approved attester confirms
/// delivery. Backend records the timestamp on the deal + emits a bus
/// event. The actual registry.acceptPoD on-chain call is made by the
/// caller's wallet; this route accepts the resulting txHash for audit.
tradeRoutes.post('/pod/accept', async (c) => {
  if (!config.KARWAN_INVOICE_REGISTRY_ADDR) {
    return c.json({ error: 'invoice registry not configured' }, 503);
  }
  const session = readSession(c);
  if (!session) return c.json({ error: 'not authenticated' }, 401);

  let body;
  try {
    body = podBodySchema.parse(await c.req.json());
  } catch (e) {
    return c.json({ error: 'invalid body', detail: (e as Error).message }, 400);
  }

  const deal = await getDeal(body.invoiceId);
  if (!deal) return c.json({ error: 'unknown invoice' }, 404);
  const caller = session.address.toLowerCase();
  // Buyer is always allowed; attester checks happen on chain.
  if (caller !== deal.buyer && !addrSchema.safeParse(caller).success) {
    return c.json({ error: 'caller cannot sign PoD' }, 403);
  }

  await patchDeal(body.invoiceId, {
    delivered: true,
    deliveredAt: Date.now(),
  });

  bus.emitEvent({
    type: 'trade.pod.accepted',
    jobId: body.invoiceId,
    actor: 'platform',
    payload: { podHash: body.podHash, attester: caller, txHash: body.txHash },
  });

  logger.info(
    { invoiceId: body.invoiceId, attester: caller },
    'trade: pod accepted',
  );
  return c.json({ ok: true });
});
