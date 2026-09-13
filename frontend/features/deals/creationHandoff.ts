import type { QueryClient } from '@tanstack/react-query';
import type { DirectDeal } from '@/core/api';
import { qk } from '@/core/queryKeys';

type DealCache = Pick<QueryClient, 'setQueryData'>;

/**
 * Makes the confirmed creation response the first deal-page snapshot.
 *
 * The detail query still refetches on mount, so this does not replace server
 * reconciliation. It removes the empty second-read gap between a successful
 * create response and the route that displays that same deal.
 */
export function primeCreatedDirectDeal(
  cache: DealCache,
  deal: DirectDeal,
  viewer: string,
): DirectDeal {
  // Older create responses omitted the read-only chain projection even though
  // the shared response type requires it. A new, unfunded deal has no escrow.
  const readyDeal: DirectDeal = { ...deal, onChain: deal.onChain ?? null };

  cache.setQueryData(qk.deals.item(readyDeal.jobId, viewer), readyDeal);
  cache.setQueryData<DirectDeal[]>(qk.deals.list(viewer), (current) => [
    readyDeal,
    ...(current ?? []).filter(
      (candidate) => candidate.jobId.toLowerCase() !== readyDeal.jobId.toLowerCase(),
    ),
  ]);

  return readyDeal;
}

