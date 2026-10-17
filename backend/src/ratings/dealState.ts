import type { RatedDeal } from './service.js';

/// The deal fields that decide whether a deal can be rated. `DirectDeal`
/// satisfies it.
export interface DealEnding {
  jobId: string;
  buyer: string;
  seller: string;
  settledAt?: number;
  cancelledAt?: number;
  cancelKind?: string;
  resolvedSellerBps?: number;
  disputeLoser?: 'buyer' | 'seller';
}

const DISPUTE_ENDINGS = new Set(['refund-from-dispute', 'release-from-dispute', 'resolved']);

/// A deal can be rated once it ended with money moved: settled, or ended by
/// a dispute however the escrow recorded it (a v2 refund sets settledAt, a v3
/// refund sets cancelledAt). A deal withdrawn or cancelled by agreement before
/// the work cannot. The dispute outcome is read the same way on every path.
export function rateableFrom(d: DealEnding): RatedDeal {
  const disputeEnded = !!d.cancelKind && DISPUTE_ENDINGS.has(d.cancelKind);
  const endedAt = d.cancelledAt && !disputeEnded ? null : (d.settledAt ?? d.cancelledAt ?? null);
  return { jobId: d.jobId, buyer: d.buyer, seller: d.seller, settledAt: endedAt, dispute: disputeOf(d) };
}

function disputeOf(d: DealEnding): RatedDeal['dispute'] {
  const bps = d.resolvedSellerBps;
  if (bps !== undefined && bps > 0 && bps < 10_000) return 'split';
  if (d.disputeLoser) return d.disputeLoser;
  if (d.cancelKind === 'refund-from-dispute' || (d.cancelKind === 'resolved' && bps === 0)) return 'seller';
  if (d.cancelKind === 'release-from-dispute' || (d.cancelKind === 'resolved' && bps === 10_000)) return 'buyer';
  return null;
}
