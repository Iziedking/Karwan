import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { CreStore } from '../cre/store.js';
import type { X402Payment } from '../x402/sellerFacilitator.js';

/// Agents acting for a deal's buyer or seller pay in USDC with x402 to run the
/// deal's agreed checks on a branch before delivering, and to fetch the
/// evidence behind a check result. CRE takes no payment itself: Karwan's x402
/// seller is paid, then starts the workflow through Chainlink's gateway.
export const CRE_PRICES = { dryRun: 0.25, evidence: 0.01 } as const;

export interface X402CreDeps {
  store: CreStore;
  charge(c: Context, priceUsd: number, description: string): Promise<X402Payment | Response>;
  /// The deal role of the person a wallet (or their agent's x402 signer) belongs to.
  partyOf(wallet: string, family: string, dealId: string): Promise<'buyer' | 'seller' | null>;
  /// terms.verifier of the deal, or null when there is no such deal.
  dealVerifier(family: string, dealId: string): Promise<string | null>;
  creVerifiers: string[];
  start(input: { dryRunId: string; family: string; dealId: string; branchSha: string; pull?: number }): Promise<{ executionId: string }>;
  newId(): string;
  now(): number;
  adapter: string;
}

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const dryRunBody = z.object({ branchSha: z.string().regex(/^[0-9a-f]{40}$/), pull: z.number().int().positive().optional() }).strict();

export function createX402CreRoutes(deps: X402CreDeps) {
  const app = new Hono();
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  async function claimedParty(c: Context, family: string, dealId: string) {
    const claimed = c.req.header('x-karwan-payer');
    if (!claimed || !address.safeParse(claimed).success) return null;
    return (await deps.partyOf(claimed, family, dealId)) ? claimed : null;
  }

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

    const payment = await deps.charge(c, CRE_PRICES.dryRun, 'Karwan: run the agreed checks on a branch, on Chainlink CRE');
    if (payment instanceof Response) return payment;
    if (!(await deps.partyOf(payment.payer, family, dealId)) || !same(payment.payer, claimed)) {
      return c.json({ error: 'the payment did not come from the deal\'s party' }, 403);
    }
    const dryRunId = deps.newId();
    await deps.store.putDryRun(dryRunId, { state: 'queued' }, deps.now());
    deps.start({ dryRunId, family, dealId, branchSha: body.data.branchSha, ...(body.data.pull ? { pull: body.data.pull } : {}) })
      .then(({ executionId }) => deps.store.putDryRun(dryRunId, { state: 'started', executionId }, deps.now()))
      .catch(() => deps.store.putDryRun(dryRunId, { state: 'not-started' }, deps.now()));
    return c.json({ dryRunId, poll: `/api/x402/cre/dry-run/${dryRunId}` }, 202);
  });

  app.get('/dry-run/:id', async (c) => {
    const id = c.req.param('id');
    const run = await deps.store.getDryRun(id);
    return run ? c.json({ dryRunId: id, ...run }) : c.json({ error: 'unknown dry run' }, 404);
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
