import type { DirectDeal } from '@/core/api';

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;

type FactoringRecipientDeal = Pick<
  DirectDeal,
  'factoringAdvanceRecipient' | 'sellerAgentAddress' | 'seller'
>;

function normalizedAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== 'string' || !EVM_ADDRESS.test(value)) return null;
  return value.toLowerCase() as `0x${string}`;
}

/**
 * Prefer the recipient explicitly published by the backend. During a rolling
 * deploy, older responses fall back to the same seller-agent/direct-wallet
 * rule used by the contract-facing backend. An explicit malformed value fails
 * closed instead of silently authorizing a different account.
 */
export function resolveFactoringAdvanceRecipient(
  deal: FactoringRecipientDeal,
): `0x${string}` | null {
  if (deal.factoringAdvanceRecipient !== undefined) {
    return normalizedAddress(deal.factoringAdvanceRecipient);
  }
  return normalizedAddress(deal.sellerAgentAddress ?? deal.seller);
}
