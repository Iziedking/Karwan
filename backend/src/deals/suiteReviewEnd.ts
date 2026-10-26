import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';

/// Review, then pay (owner, 25 Oct 2026). On the escrow family a delivered
/// payment goes to the seller when the buyer's review time ends with no release
/// and no problem raised, as the contract's claim allows. A day before, the
/// buyer is reminded that they can release, ask once for more time, or raise a
/// problem. The end is always read from the chain, so more time moves it.

export const REMIND_BEFORE_MS = 24 * 3_600_000;
/// A claim the chain refused (a hold, a check) is tried again after this, not every tick.
export const CLAIM_RETRY_MS = 30 * 60_000;

export type ReviewEndStep = 'wait' | 'remind' | 'claim';

export function reviewEndStep(input: { deal: DirectDeal; view: DealV3View; reviewEndSecs: bigint; nowMs: number }): ReviewEndStep {
  const { deal, view, reviewEndSecs, nowMs } = input;
  if (deal.escrowVersion !== 'suite' || deal.disputed) return 'wait';
  if (view.state !== DEAL_STATE.Accepted || view.deliveredAt === 0n) return 'wait';
  // A deposit returns to the buyer at the end; nobody claims it for the seller.
  if (deal.escrowTerms && 'silenceOutcome' in deal.escrowTerms && deal.escrowTerms.silenceOutcome === 1) return 'wait';
  // A failed check on this delivery is the buyer's case, not silence.
  if (deal.v3CheckFailedRevision === view.revision) return 'wait';
  // A review that waits on arrival or a check has no end yet.
  if (reviewEndSecs === 0n) return 'wait';
  const endMs = Number(reviewEndSecs) * 1000;
  if (nowMs >= endMs) return deal.reviewClaimRetryAt && nowMs < deal.reviewClaimRetryAt ? 'wait' : 'claim';
  const r = deal.reviewReminder;
  const reminded = r && r.revision === view.revision && r.paid === view.paid && r.endSecs === Number(reviewEndSecs);
  return nowMs >= endMs - REMIND_BEFORE_MS && !reminded ? 'remind' : 'wait';
}

export interface SuiteReviewEndDeps {
  readView(deal: DirectDeal): Promise<DealV3View>;
  readReviewEnd(deal: DirectDeal): Promise<bigint>;
  /// The selling agent claims the delivered payment; resolves once the chain shows it paid.
  claim(deal: DirectDeal, index: number): Promise<string>;
  recordSettlement(deal: DirectDeal): Promise<unknown>;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  emit(e: { type: 'deal.review.ending'; jobId: string; actor: 'platform'; payload: Record<string, unknown> }): void;
}

export async function runSuiteReviewEnd(deps: SuiteReviewEndDeps, deal: DirectDeal, nowMs: number): Promise<ReviewEndStep> {
  const [view, reviewEndSecs] = await Promise.all([deps.readView(deal), deps.readReviewEnd(deal)]);
  const step = reviewEndStep({ deal, view, reviewEndSecs, nowMs });
  if (step === 'remind') {
    const endSecs = Number(reviewEndSecs);
    await deps.patchDeal(deal.jobId, { reviewReminder: { revision: view.revision, paid: view.paid, endSecs } });
    deps.emit({
      type: 'deal.review.ending',
      jobId: deal.jobId,
      actor: 'platform',
      payload: { buyer: deal.buyer, seller: deal.seller, endsAt: endSecs * 1000, canAskMoreTime: view.extUsed === 0 },
    });
  } else if (step === 'claim') {
    try {
      await deps.claim(deal, view.paid);
    } catch (err) {
      await deps.patchDeal(deal.jobId, { reviewClaimRetryAt: nowMs + CLAIM_RETRY_MS });
      throw err;
    }
    await deps.recordSettlement(deal);
  }
  return step;
}
