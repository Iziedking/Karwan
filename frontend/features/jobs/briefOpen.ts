import type { BuyerJob } from '@/core/api';

/// Whether the buyer can still change or cancel their request. A search that
/// ended with no deal leaves it open until its date (view 46); a match in play,
/// a funded deal or a closed request does not.
export function briefOpenForChange(
  job: Pick<BuyerJob, 'finalized' | 'negotiationEndedAt' | 'escrowFunded' | 'expiredAt' | 'cancelledAt'>,
  matchPending: boolean,
): boolean {
  return (
    (!job.finalized || !!job.negotiationEndedAt) &&
    !job.escrowFunded &&
    !job.expiredAt &&
    !job.cancelledAt &&
    !matchPending
  );
}
