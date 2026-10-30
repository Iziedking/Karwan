import { Hono } from 'hono';
import { formatUnits, parseUnits, type Hex } from 'viem';
import { z } from 'zod';
import type { DirectDeal } from '../db/deals.js';
import type { FactoringOffer } from '../db/factoring.js';
import { eligibility, notEligibleLine, type FamilyFinancing, type Receivable } from '../money/familyFinancing.js';

/// Getting paid early on an escrow family deal (view 18). The factoring routes
/// branch here for a family deal; everything that decides lives in the core.

export interface FamilyRouteDeps {
  core: FamilyFinancing;
  receivable(dealId: Hex): Promise<Receivable>;
  sellerReady(deal: DirectDeal): Promise<boolean>;
  listOffers(jobId: string): Promise<FactoringOffer[]>;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<DirectDeal | null>;
  /// Tells every approved financier who is not a party that the seller asked.
  notifyFinanciers(deal: DirectDeal, seller: string): Promise<void>;
  /// The free part of the seller's deal guarantee, read through the selling agent.
  freeGuarantee(wallet: Hex): Promise<bigint>;
}

export type Reply = { status: 200 | 400 | 401 | 403 | 404 | 409; body: Record<string, unknown> };

const micros = (usdc: string) => parseUnits(usdc, 6);
const refused = (r: { refused: string; code: string; gapMicros?: string }): Reply => ({
  status: 409,
  body: { error: r.refused, code: r.code, ...(r.gapMicros ? { gapMicros: r.gapMicros } : {}) },
});

/// Older escrows take no new lines once the family is connected (owner,
/// 18 Oct 2026); null for a family deal.
export function legacyRefusal(deal: Pick<DirectDeal, 'escrowVersion'>): Reply | null {
  if (deal.escrowVersion === 'suite') return null;
  if (deal.escrowVersion === 'v3') return { status: 409, body: { error: 'financing is not available on this deal yet', code: 'FINANCING_NOT_ON_V3' } };
  return { status: 409, body: { error: 'Getting paid early now runs on new deals only. This deal finishes as it is.', code: 'FINANCING_MOVED' } };
}

/// What the seller's offer list adds for a family offer: the part of their
/// deal guarantee it holds, what they would put up first, and whether the
/// financier still has to pay.
export function familyOfferView(o: FactoringOffer, freeMicros: bigint): { holdUsdc?: string; gapUsdc?: string; waitingForFinancier?: boolean; sellerDeadline?: number } {
  if (o.rail !== 'family') return {};
  const hold = BigInt(o.stakeMicros ?? '0');
  const waiting = o.status === 'awaiting_financier';
  return {
    holdUsdc: formatUnits(hold, 6),
    ...(!waiting && hold > freeMicros ? { gapUsdc: formatUnits(hold - freeMicros, 6) } : {}),
    waitingForFinancier: waiting,
    ...(waiting && o.sellerDeadline ? { sellerDeadline: o.sellerDeadline } : {}),
  };
}

export async function familyRequest(
  deps: FamilyRouteDeps,
  i: { deal: DirectDeal; caller: string; requestedAdvanceUsdc?: string; minAdvanceUsdc?: string; ownWallet?: boolean },
): Promise<Reply> {
  const r = await deps.receivable(i.deal.escrowDealId as Hex);
  const ok = eligibility(i.deal, r, await deps.sellerReady(i.deal), await deps.listOffers(i.deal.jobId), Date.now());
  if (!ok.ok) return { status: 409, body: { error: notEligibleLine(ok.code, i.ownWallet), code: ok.code } };
  const owed = formatUnits(r.unpaid, 6);
  if (i.requestedAdvanceUsdc && micros(i.requestedAdvanceUsdc) > r.unpaid) {
    return { status: 400, body: { error: `requested advance must be at most ${owed} USDC remaining` } };
  }
  if (i.minAdvanceUsdc && micros(i.minAdvanceUsdc) >= r.unpaid) {
    return { status: 400, body: { error: 'minimum advance must be below what the deal still owes' } };
  }
  const updated = await deps.patchDeal(i.deal.jobId, {
    factoringRequestedAt: Date.now(),
    factoringMinAdvanceUsdc: i.minAdvanceUsdc,
    factoringRequestedAdvanceUsdc: i.requestedAdvanceUsdc ?? owed,
  });
  await deps.notifyFinanciers(i.deal, i.caller);
  return { status: 200, body: { deal: updated } };
}

export async function familyOffer(
  deps: FamilyRouteDeps,
  i: { deal: DirectDeal; financier: string; offeredAdvanceUsdc: string; expectedReturnUsdc: string; stakeUsdc?: string; expiresInHours: number; walletId?: string },
): Promise<Reply> {
  if (!i.deal.factoringRequestedAt) {
    return { status: 409, body: { error: 'the seller has not asked for early payout on this invoice', code: 'not_requested' } };
  }
  const advance = micros(i.offeredAdvanceUsdc);
  const out = await deps.core.createFamilyOffer({
    jobId: i.deal.jobId,
    financier: i.financier,
    advance,
    repay: micros(i.expectedReturnUsdc),
    stake: i.stakeUsdc ? micros(i.stakeUsdc) : (advance + 9n) / 10n,
    ...(i.walletId ? { walletId: i.walletId } : {}),
    expiresInHours: i.expiresInHours,
  });
  return 'offer' in out ? { status: 200, body: { offer: out.offer } } : refused(out);
}

export async function familyAccept(deps: FamilyRouteDeps, i: { offerId: string; seller: string; putUpGap: boolean }): Promise<Reply> {
  const out = await deps.core.takeOffer(i);
  return 'state' in out ? { status: 200, body: out } : refused(out);
}

const completeBody = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) });

/// The own-wallet financier's step: the calls to pay the seller, then the receipt.
/// The core is read on each request: early payment is wired only once the
/// startup checks pass, after these routes are mounted.
export function createFamilyOpenRoutes(deps: { core: () => FamilyFinancing | null; session: (c: unknown) => { address: string } | null }) {
  const app = new Hono();
  const off = { error: 'getting paid early is not set up here' };
  app.post('/offers/:offerId/open', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const core = deps.core();
    if (!core) return c.json(off, 503);
    const out = await core.prepareOpenCalls({ offerId: c.req.param('offerId'), financier: session.address });
    if ('calls' in out) return c.json(out);
    const r = refused(out);
    return c.json(r.body, r.status as 409);
  });
  app.post('/offers/:offerId/open/complete', async (c) => {
    const session = deps.session(c);
    if (!session) return c.json({ error: 'not authenticated' }, 401);
    const body = completeBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'invalid body' }, 400);
    const core = deps.core();
    if (!core) return c.json(off, 503);
    const out = await core.completeOpen({ offerId: c.req.param('offerId'), financier: session.address, txHash: body.data.txHash as Hex });
    if ('state' in out) return c.json(out);
    const r = refused(out);
    return c.json(r.body, r.status as 409);
  });
  return app;
}
