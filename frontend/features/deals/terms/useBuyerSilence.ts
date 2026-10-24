import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import type { BuyerSilence } from './composeTerms';

/// What the buyer's silence after review does on the escrow new deals open on,
/// so the review clause a deal is agreed on matches it.
export function useBuyerSilence(): BuyerSilence | undefined {
  const { data } = useQuery({
    queryKey: ['dispute-policy'],
    queryFn: () => api.disputePolicy(),
    staleTime: 5 * 60_000,
  });
  return data?.buyerSilence;
}
