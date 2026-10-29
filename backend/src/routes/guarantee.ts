import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { formatUnits, parseUnits, type Hex } from 'viem';
import type { SessionPayload } from '../auth/session.js';
import { guaranteeState, type VaultStake } from '../chain/guaranteeVault.js';
import { guaranteeOperationKey, type GuaranteeStep } from '../money/guarantee.js';
import { presenceAction, type PresenceAction } from '../presence/action.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Deal guarantee on the family vault (view 37). A wallet Karwan holds is
/// signed for here after the person confirms; an own wallet prepares an intent,
/// signs in the browser and comes back with the transaction to prove.

export interface GuaranteeDeps {
  vault: () => Hex | null;
  usdc: Hex;
  session: (c: Context) => SessionPayload | null;
  requirePresence: (c: Context, action: PresenceAction) => Promise<Response | null>;
  identityId: (address: string) => Promise<bigint>;
  /// Sets up the record where Karwan holds the wallets; reports only otherwise.
  ensureRecord: (address: string) => Promise<'ready' | 'not-ready'>;
  read: {
    stakeOf: (identityId: bigint) => Promise<VaultStake>;
    freeOf: (identityId: bigint) => Promise<bigint>;
    balanceOf: (address: string) => Promise<bigint>;
    previousVaultMicros: (address: string) => Promise<bigint>;
  };
  now: () => number;
  /// The identity wallet Karwan holds for this person, if it holds one.
  circleWalletId: (address: string) => Promise<string | null>;
  executeCircle: (input: {
    operationKey: string;
    step: GuaranteeStep;
    walletAddress: string;
    walletId: string;
    identityId: bigint;
    vaultAddress: string;
    usdcAddress: string;
    amountMicros: bigint;
  }) => Promise<{ reference: string; txHash: string | null }>;
  prepareWeb3: (input: { operationKey: string; step: GuaranteeStep; walletAddress: string; vaultAddress: string; amountMicros: bigint }) => Promise<{ reference: string }>;
  completeWeb3: (input: {
    reference: string;
    step: GuaranteeStep;
    walletAddress: string;
    identityId: bigint;
    vaultAddress: string;
    usdcAddress: string;
    amountMicros: bigint;
    txHash: string;
  }) => Promise<{ reference: string }>;
  findIntent: (operationKey: string) => Promise<{ reference: string; amountMicros: string } | null>;
  activity: (entry: { step: GuaranteeStep; address: string; amountMicros: bigint; txHash: string | null; reference: string; requestId: string }) => void;
}

const WAIT_DAYS = 7;
const usdc = (micros: bigint) => formatUnits(micros, 6);
const amountSchema = z.string().regex(/^\d+(\.\d{1,6})?$/);
const requestId = z.string().min(1).max(100);
const withAmount = z.object({ amountUsdc: amountSchema, requestId });
const noAmount = z.object({ requestId });
const stepSchema = z.enum(['put_up', 'take_out', 'cancel', 'collect']);
const intentSchema = z.object({ step: stepSchema, amountUsdc: amountSchema.optional(), requestId });
const completeSchema = intentSchema.extend({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

type Refusal = { status: 409; body: Record<string, unknown> };

export function createGuaranteeRoutes(deps: GuaranteeDeps): Hono {
  const app = new Hono();

  async function readState(address: string) {
    const identityId = await deps.identityId(address);
    const stake = identityId === 0n ? { active: 0n, reserved: 0n, cooling: 0n, coolUntil: 0n } : await deps.read.stakeOf(identityId);
    const free = identityId === 0n ? 0n : await deps.read.freeOf(identityId);
    return { identityId, state: guaranteeState(stake, free, deps.now()) };
  }

  /// What each step moves, or why it cannot run now. Checked before the person
  /// is asked anything and again before Karwan signs.
  async function plan(address: string, step: GuaranteeStep, amountUsdc: string | undefined): Promise<{ amountMicros: bigint } | Refusal> {
    const { state } = await readState(address);
    if (step === 'put_up' || step === 'take_out') {
      const amountMicros = amountUsdc ? parseUnits(amountUsdc, 6) : 0n;
      if (amountMicros <= 0n) return { status: 409, body: { code: 'bad_amount', error: 'Enter an amount above 0.' } };
      if (step === 'put_up') {
        const balance = await deps.read.balanceOf(address);
        if (amountMicros > balance) return { status: 409, body: { code: 'not_enough', error: `Your balance is ${usdc(balance)} USDC.`, balanceUsdc: usdc(balance) } };
      } else if (amountMicros > state.freeMicros) {
        return { status: 409, body: { code: 'over_free', error: `You can take out up to ${usdc(state.freeMicros)} USDC now.`, freeUsdc: usdc(state.freeMicros), heldUsdc: usdc(state.heldMicros) } };
      }
      return { amountMicros };
    }
    if (state.comingBackMicros === 0n) return { status: 409, body: { code: 'nothing_coming_back', error: 'Nothing is coming back from your guarantee.' } };
    if (step === 'collect' && !state.ready) return { status: 409, body: { code: 'not_ready', error: 'Not ready to collect yet.', readyAt: state.readyAt } };
    return { amountMicros: state.comingBackMicros };
  }

  app.get('/', async (c) => {
    c.header('Cache-Control', 'no-store');
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    if (!deps.vault()) return c.json({ available: false });
    const [{ identityId, state }, previous] = await Promise.all([readState(session.address), deps.read.previousVaultMicros(session.address)]);
    return c.json({
      available: true,
      hasRecord: identityId !== 0n,
      inPlaceUsdc: usdc(state.inPlaceMicros),
      heldUsdc: usdc(state.heldMicros),
      freeUsdc: usdc(state.freeMicros),
      comingBackUsdc: usdc(state.comingBackMicros),
      readyAt: state.readyAt,
      ready: state.ready,
      previousUsdc: usdc(previous),
      waitDays: WAIT_DAYS,
    });
  });

  async function heldStep(c: Context, step: GuaranteeStep) {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const vault = deps.vault();
    if (!vault) return c.json({ code: 'guarantee_off', error: 'The deal guarantee is not available right now.' }, 409);
    let body: { amountUsdc?: string; requestId: string };
    try {
      body = (step === 'put_up' || step === 'take_out' ? withAmount : noAmount).parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const walletId = await deps.circleWalletId(session.address);
    if (!walletId) return c.json({ code: 'sign_in_wallet', error: 'Sign this step in your own wallet.' }, 409);
    const planned = await plan(session.address, step, body.amountUsdc);
    if ('status' in planned) return c.json(planned.body, planned.status);
    if (step === 'put_up') {
      const unconfirmed = await deps.requirePresence(
        c,
        presenceAction({ kind: 'deal_guarantee', wallet: session.address, amountMicros: planned.amountMicros.toString(), recipient: vault }),
      );
      if (unconfirmed) return unconfirmed;
      await deps.ensureRecord(session.address);
    }
    const identityId = await deps.identityId(session.address);
    if (identityId === 0n) return c.json({ code: 'record_not_ready', error: 'Your account could not be set up for deals. Try again in a moment.' }, 409);
    try {
      const out = await deps.executeCircle({
        operationKey: guaranteeOperationKey(session.address, step, body.requestId),
        step,
        walletAddress: session.address,
        walletId,
        identityId,
        vaultAddress: vault,
        usdcAddress: deps.usdc,
        amountMicros: planned.amountMicros,
      });
      deps.activity({ step, address: session.address, amountMicros: planned.amountMicros, txHash: out.txHash, reference: out.reference, requestId: body.requestId });
      return c.json({ ok: true, reference: out.reference, txHash: out.txHash, amountUsdc: usdc(planned.amountMicros) });
    } catch (err) {
      return c.json({ error: 'The guarantee step did not go through.', detail: (err as Error).message }, 502);
    }
  }

  app.post('/put-up', (c) => heldStep(c, 'put_up'));
  app.post('/take-out', (c) => heldStep(c, 'take_out'));
  app.post('/cancel-take-out', (c) => heldStep(c, 'cancel'));
  app.post('/collect', (c) => heldStep(c, 'collect'));

  app.post('/intent', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const vault = deps.vault();
    if (!vault) return c.json({ code: 'guarantee_off', error: 'The deal guarantee is not available right now.' }, 409);
    let body: z.infer<typeof intentSchema>;
    try {
      body = intentSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    if (await deps.circleWalletId(session.address)) return c.json({ code: 'karwan_signs', error: 'Karwan signs this step for you.' }, 409);
    const planned = await plan(session.address, body.step, body.amountUsdc);
    if ('status' in planned) return c.json(planned.body, planned.status);
    const prepared = await deps.prepareWeb3({
      operationKey: guaranteeOperationKey(session.address, body.step, body.requestId),
      step: body.step,
      walletAddress: session.address,
      vaultAddress: vault,
      amountMicros: planned.amountMicros,
    });
    return c.json({
      reference: prepared.reference,
      vault,
      usdc: deps.usdc,
      amountMicros: planned.amountMicros.toString(),
      amountUsdc: usdc(planned.amountMicros),
    });
  });

  app.post('/complete', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const vault = deps.vault();
    if (!vault) return c.json({ code: 'guarantee_off', error: 'The deal guarantee is not available right now.' }, 409);
    let body: z.infer<typeof completeSchema>;
    try {
      body = completeSchema.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    if (await deps.circleWalletId(session.address)) return c.json({ code: 'karwan_signs', error: 'Karwan signs this step for you.' }, 409);
    const operationKey = guaranteeOperationKey(session.address, body.step, body.requestId);
    const intent = await deps.findIntent(operationKey);
    if (!intent) return c.json({ code: 'intent_not_found', error: 'Start again before signing.' }, 409);
    const identityId = await deps.identityId(session.address);
    if (identityId === 0n) return c.json({ code: 'record_not_ready', error: 'Your account is not set up for deals yet.' }, 409);
    const amountMicros = BigInt(intent.amountMicros);
    try {
      const out = await deps.completeWeb3({
        reference: intent.reference,
        step: body.step,
        walletAddress: session.address,
        identityId,
        vaultAddress: vault,
        usdcAddress: deps.usdc,
        amountMicros,
        txHash: body.txHash,
      });
      deps.activity({ step: body.step, address: session.address, amountMicros, txHash: body.txHash, reference: out.reference, requestId: body.requestId });
      return c.json({ ok: true, reference: out.reference, txHash: body.txHash, amountUsdc: usdc(amountMicros) });
    } catch (err) {
      return c.json({ error: 'The guarantee step could not be proved.', detail: (err as Error).message }, 409);
    }
  });

  return app;
}
