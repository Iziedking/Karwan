import type { DirectDeal } from '../db/deals.js';

/// A delivery the guard check failed. It is on chain as delivered, but it did
/// not match what the buyer asked for, so it earns nothing on a timer.
export function deliveryFailedCheck(
  deal: Pick<DirectDeal, 'releaseBlockedReason' | 'deliveryMatch'>,
): boolean {
  return (
    deal.releaseBlockedReason === 'requirement-mismatch' ||
    deal.releaseBlockedReason === 'security-hold' ||
    deal.deliveryMatch?.verdict === 'mismatch'
  );
}

/// What the dispute timer rules when nobody settled the dispute in time: the
/// seller keeps the money only for a delivery that passed the check; no
/// delivery, or one the check failed, is a full refund.
export function timeoutRuling(
  deal: Pick<DirectDeal, 'delivered' | 'releaseBlockedReason' | 'deliveryMatch'>,
): { sellerBps: number; reason: string } {
  if (deal.delivered && !deliveryFailedCheck(deal)) {
    return { sellerBps: 10000, reason: 'auto-arbiter: seller delivered and the buyer went silent past the dispute window' };
  }
  if (deal.delivered) {
    return { sellerBps: 0, reason: 'auto-arbiter: the delivery failed the check and the dispute window passed' };
  }
  return { sellerBps: 0, reason: 'auto-arbiter: no delivery and the buyer went silent past the dispute window' };
}
