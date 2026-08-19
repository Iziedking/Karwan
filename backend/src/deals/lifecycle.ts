import type { DirectDeal } from '../db/deals.js';

type SellerAgreementWindow = Pick<
  DirectDeal,
  'acceptedAt' | 'sellerApprovedAt' | 'acceptanceDeadlineUnix'
>;

/**
 * The commercial acceptance deadline ends when the seller agrees, even though
 * the buyer has not funded escrow yet. Funding has its own explicit review
 * step and must not be cancelled by the earlier seller-response timer.
 */
export function sellerAgreementExpired(
  deal: SellerAgreementWindow,
  nowMs: number,
): boolean {
  return (
    deal.acceptedAt == null &&
    deal.sellerApprovedAt == null &&
    deal.acceptanceDeadlineUnix != null &&
    nowMs > deal.acceptanceDeadlineUnix * 1000
  );
}
