import type { DirectDeal } from '../db/deals.js';

export type DeliveryCheckState = 'checking' | 'passed' | 'held' | 'unverified';

/// Where the delivery check stands, in words both parties may see. The buyer's
/// written review stays private; this only says whether money can move. The
/// verdict is known the moment the seller delivers, so a mismatch reads as held
/// at once rather than after the watcher's next pass pauses the release.
export function deliveryCheckState(
  deal: Pick<DirectDeal, 'delivered' | 'tradeType' | 'deliveryMatch' | 'releaseBlockedReason' | 'deliveryProof' | 'terms'>,
): DeliveryCheckState | null {
  // Goods deliver against a proof of delivery, and a delivery with no link or a
  // deal with no written terms is never checked, so none of these has a status.
  if (!deal.delivered || deal.tradeType === 'goods' || !deal.deliveryProof || !deal.terms) return null;
  if (deal.releaseBlockedReason) return 'held';
  const verdict = deal.deliveryMatch?.verdict;
  if (!verdict) return 'checking';
  if (verdict === 'mismatch' || verdict === 'partial') return 'held';
  return verdict === 'aligned' ? 'passed' : 'unverified';
}
