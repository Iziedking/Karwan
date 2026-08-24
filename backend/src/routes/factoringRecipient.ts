import type { DirectDeal } from '../db/deals.js';

/**
 * Keep recipient selection pure and independent of chain configuration so the
 * factoring route and its characterization tests do not need to bind live
 * contract addresses at module import time.
 */
export function factoringAdvanceRecipient(
  deal: Pick<DirectDeal, 'seller' | 'sellerAgentAddress'>,
): string {
  return (deal.sellerAgentAddress ?? deal.seller).toLowerCase();
}
