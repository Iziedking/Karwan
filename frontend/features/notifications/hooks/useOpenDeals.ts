'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DirectDeal, type MatchProposal } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { stageOf, type DealStage } from '@/features/deals/components/DirectDealList';
import { useDirectDeals } from '@/features/deals/hooks/useDirectDeals';
import { presentMatchingState } from '@/features/jobs/matchingPresentation';
import { useAuth } from '@/shared/hooks/useAuth';
import { directDealNeedsViewer, isOpenDirectDealStage } from '../openDealsModel';

export interface OpenDirectDeal {
  deal: DirectDeal;
  isBuyer: boolean;
  stage: DealStage;
  viewerMustAct: boolean;
}

type OpenDealsFetchState = 'idle' | 'loading' | 'success' | 'partial-error' | 'error';

/**
 * One cached source for every Profile open-work indicator. Multiple consumers
 * (tab strip, desktop avatar and mobile nav) share the same match/deal reads,
 * so adding an attention mark never multiplies polling traffic.
 */
export function useOpenDeals() {
  const auth = useAuth();
  const address = auth.address;
  const enabled = auth.isAuthenticated && !!address;
  const queryClient = useQueryClient();
  const direct = useDirectDeals();

  const matchesQuery = useQuery({
    queryKey: qk.matches.list(address),
    queryFn: () => api.matchesFor(address!).then((data) => data.proposals),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 10_000 : false,
  });

  const matches = (matchesQuery.data ?? []) as MatchProposal[];
  const directDeals = useMemo<OpenDirectDeal[]>(() => {
    const me = address?.toLowerCase() ?? '';
    return direct.deals.flatMap((deal) => {
      const stage = stageOf(deal);
      if (!isOpenDirectDealStage(stage)) return [];
      const isBuyer = deal.buyer.toLowerCase() === me;
      return [{ deal, isBuyer, stage, viewerMustAct: directDealNeedsViewer(stage, isBuyer) }];
    });
  }, [address, direct.deals]);

  const matchActionCount = matches.reduce((count, proposal) => {
    return count + (presentMatchingState({ proposal, viewerAddress: address }).viewerMustAct ? 1 : 0);
  }, 0);
  const directActionCount = directDeals.reduce(
    (count, item) => count + (item.viewerMustAct ? 1 : 0),
    0,
  );
  const totalCount = matches.length + directDeals.length;
  const actionCount = matchActionCount + directActionCount;

  const matchesState = !enabled
    ? 'idle'
    : matchesQuery.isError
      ? 'error'
      : matchesQuery.isSuccess
        ? 'success'
        : 'loading';
  const hasError = matchesState === 'error' || direct.fetchState === 'error';
  const hasSuccess = matchesState === 'success' || direct.fetchState === 'success';
  const fetchState: OpenDealsFetchState = !enabled
    ? 'idle'
    : hasError && hasSuccess
      ? 'partial-error'
      : hasError
        ? 'error'
        : matchesState === 'success' && direct.fetchState === 'success'
          ? 'success'
          : 'loading';

  return {
    matches,
    directDeals,
    totalCount,
    actionCount,
    hasOpenDeals: totalCount > 0,
    hasAction: actionCount > 0,
    fetchState,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: qk.matches.list(address) });
      direct.refresh();
    },
  };
}
