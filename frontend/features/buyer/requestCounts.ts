import type { BuyerJob } from '@/core/api';

/// Requests still looking for or settling an offer. A cancelled, expired or
/// funded request has ended, whether or not its row is still on screen.
export function openRequestCount(jobs: readonly BuyerJob[]): number {
  return jobs.filter((j) => !j.cancelledAt && !j.expiredAt && !j.escrowFunded).length;
}
