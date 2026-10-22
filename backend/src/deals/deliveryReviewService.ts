import type { DirectDeal } from '../db/deals.js';
import { decideDeliveryReview, type ReviewDecision, type ReviewerRole, type ReviewResult } from './deliveryReview.js';

/// Applies a reviewer's decision on a flagged delivery link. Clearing makes the
/// delivery read as clean everywhere (the buyer sees the link, the release
/// checks run as normal), lifts the on-chain hold, takes the wrongly recorded
/// offense off the seller, and tells both people. Keeping it blocked tells the
/// seller to send a new link.

export interface DeliveryReviewDeps {
  getDeal: (jobId: string) => Promise<DirectDeal | null>;
  record: (snapshot: DirectDeal, patch: Partial<DirectDeal>) => Promise<DirectDeal | null>;
  releaseHold: (deal: DirectDeal) => Promise<unknown>;
  withdrawOffense: (input: { address: string; jobId: string; surface: 'delivery'; verdict: 'suspicious' | 'malicious' }) => unknown;
  publishEvidence: (jobId: string) => Promise<unknown>;
  emitCleared: (deal: DirectDeal) => void;
  systemMessage: (jobId: string, eventType: string, body: string) => Promise<unknown>;
  now: () => number;
}

export type ApplyResult = ReviewResult | { ok: false; code: 'not-found' | 'changed'; message: string };

export async function applyDeliveryReview(
  jobId: string,
  input: { role: ReviewerRole; decision: ReviewDecision; reason: string },
  deps: DeliveryReviewDeps,
): Promise<ApplyResult> {
  const deal = await deps.getDeal(jobId);
  if (!deal) return { ok: false, code: 'not-found', message: 'No deal has this id.' };
  const now = deps.now();
  const result = decideDeliveryReview(deal, input, now);
  if (!result.ok) return result;

  const patch: Partial<DirectDeal> = result.clears
    ? {
        deliveryReview: result.review,
        verificationStatus: 'clean',
        verificationReasons: [],
        releaseBlockedReason: undefined,
        releaseBlockedAt: undefined,
        releaseBlockedDetail: undefined,
        // The buyer could not see the link until now, so their review window starts now.
        deliveredAt: now,
      }
    : { deliveryReview: result.review };
  const saved = await deps.record(deal, patch);
  if (!saved) return { ok: false, code: 'changed', message: 'The delivery changed while this was being saved. Open the deal again.' };

  if (result.clears) {
    deps.withdrawOffense({ address: deal.seller, jobId: deal.jobId, surface: 'delivery', verdict: result.review.originalVerdict });
    await Promise.allSettled([deps.releaseHold(saved), deps.publishEvidence(deal.jobId)]);
    deps.emitCleared(saved);
    await deps.systemMessage(deal.jobId, 'deal.delivery.reviewed', 'Karwan support checked the delivery link and found it safe. The buyer can now open it, and payment follows the usual steps.');
  } else if (result.review.decision === 'unsafe') {
    await deps.systemMessage(deal.jobId, 'deal.delivery.reviewed', 'Karwan support checked the delivery link and kept it blocked. The seller needs to send a new delivery link.');
  }
  return result;
}

export async function liveDeliveryReviewDeps(): Promise<DeliveryReviewDeps> {
  const [{ getDeal, recordDeliveryReview }, { dealEscrowOps }, { withdrawLinkOffense }, { automaticallyPublishCreDelivery }, { bus }, { addSystemMessage }] = await Promise.all([
    import('../db/deals.js'),
    import('./dealEscrowOpsLive.js'),
    import('../security/linkOffenses.js'),
    import('../evidence/creAutoPublication.js'),
    import('../events.js'),
    import('../chat/systemMessages.js'),
  ]);
  return {
    getDeal,
    record: recordDeliveryReview,
    releaseHold: (deal) => dealEscrowOps.releaseHold(deal),
    withdrawOffense: withdrawLinkOffense,
    publishEvidence: automaticallyPublishCreDelivery,
    emitCleared: (deal) => bus.emitEvent({
      type: 'deal.delivery.cleared',
      jobId: deal.jobId,
      actor: 'platform',
      payload: { buyer: deal.buyer, seller: deal.seller, firstReleasePct: deal.firstReleasePct, tradeType: deal.tradeType, reviewedBy: 'support' },
    }),
    systemMessage: (jobId, eventType, body) =>
      addSystemMessage({ jobId, channel: 'trade', channelKey: jobId, eventType, occurrenceKey: String(Date.now()), body }),
    now: Date.now,
  };
}
