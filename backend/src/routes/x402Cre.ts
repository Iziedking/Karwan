import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { CreStore } from '../cre/store.js';
import type { X402Payment } from '../x402/sellerFacilitator.js';

/// Agents acting for a deal's buyer or seller pay in USDC to run the deal's
/// agreed checks on a branch before delivering, and to fetch the evidence
/// behind a check result. A dry-run payment goes to KarwanCreFees on Arc, not
/// to Karwan: it is released to Karwan only by an answer Chainlink's network
/// signs, and anyone can return it to the payer after an hour without one.
export const CRE_PRICES = { dryRun: 0.25, evidence: 0.01 } as const;

/// A payer's signed USDC ReceiveWithAuthorization for the fee contract.
export interface FeeAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
}

export interface X402CreDeps {
  store: CreStore;
  charge(c: Context, priceUsd: number, description: string): Promise<X402Payment | Response>;
  /// The deal role of the person a wallet (or their agent's x402 signer) belongs to.
  partyOf(wallet: string, family: string, dealId: string): Promise<'buyer' | 'seller' | null>;
  /// terms.verifier of the deal, or null when there is no such deal.
  dealVerifier(family: string, dealId: string): Promise<string | null>;
  creVerifiers: string[];
  fee: { contract: string; usdc: string; network: string; amountAtomic: string; refundAfterSec: number };
  /// Relays KarwanCreFees.open on Arc; the run id once Arc shows the run open.
  openFee(auth: FeeAuthorization): Promise<{ runId: string } | { error: string }>;
  start(input: { runId: string; family: string; dealId: string; branchSha: string; pull?: number }): Promise<{ executionId: string }>;
  now(): number;
  adapter: string;
}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uint = z.string().regex(/^[0-9]{1,78}$/);
const dryRunBody = z.object({ branchSha: z.string().regex(/^[0-9a-f]{40}$/), pull: z.number().int().positive().optional() }).strict();
const paymentSchema = z.object({
  payload: z.object({
    signature: z.string().regex(/^0x[0-9a-fA-F]{130,}$/),
    authorization: z.object({ from: address, to: address, value: uint, validAfter: uint, validBefore: uint, nonce: hex32 }),
  }),
});
/// Arc needs time to include the open; an authorization closer to expiry is refused.
const MIN_VALIDITY_SEC = 120;

export function createX402CreRoutes(deps: X402CreDeps) {
  const app = new Hono();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const nowSec = () => Math.floor(deps.now() / 1000);

  async function claimedParty(c: Context, family: string, dealId: string) {
    const claimed = c.req.header('x-karwan-payer');
    if (!claimed || !address.safeParse(claimed).success) return null;
    return (await deps.partyOf(claimed, family, dealId)) ? claimed : null;
  }

  function paymentRequired(c: Context, reason?: string) {
    const required = {
      x402Version: 2,
      resource: { url: c.req.path, description: 'Karwan: run the agreed checks on a branch, on Chainlink CRE', mimeType: 'application/json' },
      accepts: [{
        scheme: 'exact',
        network: deps.fee.network,
        amount: deps.fee.amountAtomic,
        asset: deps.fee.usdc,
        payTo: deps.fee.contract,
        maxTimeoutSeconds: deps.fee.refundAfterSec,
        extra: { name: 'USDC', version: '2', primaryType: 'ReceiveWithAuthorization' },
      }],
    };
    c.header('PAYMENT-REQUIRED', Buffer.from(JSON.stringify(required)).toString('base64'));
    return c.json(reason ? { error: reason } : {}, 402);
  }

  type StartInput = Parameters<X402CreDeps['start']>[0];
  /// What Karwan keeps while it waits; polls see only the state.
  interface PendingDryRun {
    state: 'queued' | 'started' | 'not-started';
    openedAt: number;
    executionId?: string;
    input: StartInput;
  }
  const isPending = (r: unknown): r is PendingDryRun => !!r && typeof r === 'object' && 'input' in r && 'openedAt' in r;

  app.post('/dry-run/:family/:dealId', async (c) => {
    const family = c.req.param('family');
    const dealId = c.req.param('dealId');
    if (!address.safeParse(family).success || !hex32.safeParse(dealId).success) return c.json({ error: 'bad deal' }, 400);
    const body = dryRunBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'branchSha must be a 40-character commit' }, 400);
    const claimed = await claimedParty(c, family, dealId);
    if (!claimed) return c.json({ error: 'only the deal\'s buyer or seller can dry-run its checks' }, 403);
    const verifier = await deps.dealVerifier(family, dealId);
    if (!verifier || !deps.creVerifiers.some((v) => same(v, verifier))) return c.json({ error: 'this deal has no agreed check' }, 404);

    const header = c.req.header('payment-signature');
    if (!header) return paymentRequired(c);
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(header, 'base64').toString('utf-8'));
    } catch {
      return c.json({ error: 'malformed payment-signature header' }, 400);
    }
    const parsed = paymentSchema.safeParse(decoded);
    if (!parsed.success) return c.json({ error: 'malformed payment-signature header' }, 400);
    const a = parsed.data.payload.authorization;
    if (!same(a.from, claimed)) return paymentRequired(c, 'the payment must come from the deal\'s party');
    if (!same(a.to, deps.fee.contract) || a.value !== deps.fee.amountAtomic) {
      return paymentRequired(c, 'the payment must be the price, to the fee contract');
    }
    if (Number(a.validBefore) < nowSec() + MIN_VALIDITY_SEC) return paymentRequired(c, 'the payment authorization expires too soon');

    const opened = await deps.openFee({ ...a, signature: parsed.data.payload.signature });
    if ('error' in opened) return paymentRequired(c, 'Arc did not accept the payment');

    const runId = opened.runId.toLowerCase();
    const input: StartInput = { runId, family, dealId, branchSha: body.data.branchSha, ...(body.data.pull ? { pull: body.data.pull } : {}) };
    const run: PendingDryRun = { state: 'queued', openedAt: nowSec(), input };
    await deps.store.putDryRun(runId, run, deps.now());
    deps.start(input)
      .then(({ executionId }) => deps.store.putDryRun(runId, { ...run, state: 'started', executionId }, deps.now()))
      .catch(() => deps.store.putDryRun(runId, { ...run, state: 'not-started' }, deps.now()));
    return c.json({
      runId,
      poll: `/api/x402/cre/dry-run/${runId}`,
      fee: { contract: deps.fee.contract, refundableAfter: run.openedAt + deps.fee.refundAfterSec },
    }, 202);
  });

  app.get('/dry-run/:id', async (c) => {
    const id = c.req.param('id').toLowerCase();
    if (!hex32.safeParse(id).success) return c.json({ error: 'unknown dry run' }, 404);
    const run = await deps.store.getDryRun(id);
    if (!run) return c.json({ error: 'unknown dry run' }, 404);
    if (!isPending(run.result)) return c.json({ runId: id, ...run });
    const r = run.result;
    const unanswered = nowSec() >= r.openedAt + deps.fee.refundAfterSec;
    const result = unanswered
      ? { state: 'unanswered', refund: { contract: deps.fee.contract, call: `refund(${id})`, to: 'the payer' } }
      : { state: r.state };
    return c.json({ runId: id, result, at: run.at });
  });

  app.get('/evidence/:family/:dealId/:revision', async (c) => {
    const family = c.req.param('family');
    const dealId = c.req.param('dealId');
    const revision = Number(c.req.param('revision'));
    if (!address.safeParse(family).success || !hex32.safeParse(dealId).success || !Number.isInteger(revision) || revision < 1) {
      return c.json({ error: 'bad deal' }, 400);
    }
    const claimed = await claimedParty(c, family, dealId);
    if (!claimed) return c.json({ error: 'only the deal\'s buyer or seller can read its evidence' }, 403);
    const outcome = await deps.store.checkOutcome(`${dealId}-r${revision}`);
    if (!outcome) return c.json({ error: 'no check result for this delivery' }, 404);

    const payment = await deps.charge(c, CRE_PRICES.evidence, 'Karwan: the evidence behind a delivery check');
    if (payment instanceof Response) return payment;
    if (!same(payment.payer, claimed)) return c.json({ error: 'the payment did not come from the deal\'s party' }, 403);
    const evidenceHash = (outcome as { evidenceHash?: string }).evidenceHash;
    const doc = evidenceHash ? await deps.store.getDocument(evidenceHash) : null;
    return c.json({
      outcome,
      doc: doc?.body ?? null,
      verify: {
        adapter: deps.adapter,
        verifier: await deps.dealVerifier(family, dealId),
        how: 'keccak256 of the canonical evidence document equals evidenceHash; adapter.verdictOf(adapter.verdictKey(verifier, family, dealId, revision)) returns it on Arc.',
      },
    });
  });

  return app;
}
