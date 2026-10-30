import type { DirectDeal } from '../db/deals.js';
import { decideDeliveryReview, type ReviewDecision, type ReviewerRole, type ReviewResult } from './deliveryReview.js';

/// Applies a reviewer's decision on a flagged delivery link. Clearing the
/// current delivery of an open deal makes it read as clean everywhere (the
/// buyer sees the link, the release checks run as normal), lifts the on-chain
/// hold, takes the wrongly recorded offence off the seller, and tells both
/// people. Keeping it blocked tells the seller to send a new link.
///
/// A replaced delivery, or any delivery of a closed deal, is reviewed for the
/// record only: clearing it marks that delivery clean in the history and takes
/// the offence off the seller. Nothing changes for the money, the current
/// delivery, the release checks or the on-chain hold.

export interface DeliveryReviewDeps {
  getDeal: (jobId: string) => Promise<DirectDeal | null>;
  /// Saves a review of the current delivery; refuses when the delivery changed.
  record: (snapshot: DirectDeal, patch: Partial<DirectDeal>) => Promise<DirectDeal | null>;
  /// Saves a record-only review of one revision; refuses when that revision's record changed.
  recordForRevision: (snapshot: DirectDeal, revision: number, patch: Partial<DirectDeal>) => Promise<DirectDeal | null>;
  releaseHold: (deal: DirectDeal) => Promise<unknown>;
  withdrawOffense: (input: { address: string; jobId: string; surface: 'delivery'; verdict: 'suspicious' | 'malicious' }) => unknown;
  publishEvidence: (jobId: string) => Promise<unknown>;
  emitCleared: (deal: DirectDeal) => void;
  systemMessage: (jobId: string, eventType: string, body: string) => Promise<unknown>;
  now: () => number;
}

export type ApplyResult = ReviewResult | { ok: false; code: 'not-found' | 'changed'; message: string };

function withReview(deal: DirectDeal, review: NonNullable<DirectDeal['deliveryReview']>): Pick<DirectDeal, 'deliveryReviews'> {
  const others = (deal.deliveryReviews ?? []).filter((r) => r.deliveryRevision !== review.deliveryRevision);
  return { deliveryReviews: [...others, review].sort((a, b) => a.deliveryRevision - b.deliveryRevision) };
}

export async function applyDeliveryReview(
  jobId: string,
  input: { role: ReviewerRole; decision: ReviewDecision; reason: string; revision?: number },
  deps: DeliveryReviewDeps,
): Promise<ApplyResult> {
  const deal = await deps.getDeal(jobId);
  if (!deal) return { ok: false, code: 'not-found', message: 'No deal has this id.' };
  const now = deps.now();
  const revision = input.revision ?? deal.deliveryRevision ?? 0;
  const result = decideDeliveryReview(deal, input, now, revision);
  if (!result.ok) return result;
  const { review } = result;

  if (result.scope === 'record-only') {
    const patch: Partial<DirectDeal> = {
      ...withReview(deal, review),
      ...(result.clears
        ? {
            deliveryHistory: deal.deliveryHistory?.map((entry) =>
              entry.revision === revision ? { ...entry, verificationStatus: 'clean' as const } : entry),
          }
        : {}),
    };
    const saved = await deps.recordForRevision(deal, revision, patch);
    if (!saved) return { ok: false, code: 'changed', message: 'The delivery record changed while this was being saved. Open the deal again.' };
    if (result.clears) {
      deps.withdrawOffense({ address: deal.seller, jobId: deal.jobId, surface: 'delivery', verdict: review.originalVerdict });
      await deps.systemMessage(deal.jobId, 'deal.delivery.reviewed', 'Karwan support checked an earlier delivery link and found it safe. The record is corrected; nothing changes for the money.');
    }
    return result;
  }

  const patch: Partial<DirectDeal> = result.clears
    ? {
        deliveryReview: review,
        ...withReview(deal, review),
        verificationStatus: 'clean',
        verificationReasons: [],
        deliveryHistory: deal.deliveryHistory?.map((entry) =>
          entry.revision === review.deliveryRevision ? { ...entry, verificationStatus: 'clean' as const } : entry),
        releaseBlockedReason: undefined,
        releaseBlockedAt: undefined,
        releaseBlockedDetail: undefined,
        // The buyer could not see the link until now, so their review window starts now.
        deliveredAt: now,
      }
    : { deliveryReview: review, ...withReview(deal, review) };
  const saved = await deps.record(deal, patch);
  if (!saved) return { ok: false, code: 'changed', message: 'The delivery changed while this was being saved. Open the deal again.' };

  if (result.clears) {
    deps.withdrawOffense({ address: deal.seller, jobId: deal.jobId, surface: 'delivery', verdict: review.originalVerdict });
    await Promise.allSettled([deps.releaseHold(saved), deps.publishEvidence(deal.jobId)]);
    deps.emitCleared(saved);
    await deps.systemMessage(deal.jobId, 'deal.delivery.reviewed', 'Karwan support checked the delivery link and found it safe. The buyer can now open it, and payment follows the usual steps.');
  } else if (review.decision === 'unsafe') {
    await deps.systemMessage(deal.jobId, 'deal.delivery.reviewed', 'Karwan support checked the delivery link and kept it blocked. The seller needs to send a new delivery link.');
  }
  return result;
}

export async function liveDeliveryReviewDeps(): Promise<DeliveryReviewDeps> {
  const [{ getDeal, recordDeliveryReview, recordDeliveryReviewForRevision }, { dealEscrowOps }, { withdrawLinkOffense }, { automaticallyPublishCreDelivery }, { bus }, { addSystemMessage }] = await Promise.all([
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
    recordForRevision: recordDeliveryReviewForRevision,
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
