'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BalanceRow } from '@/core/api';
import { qk } from '@/core/queryKeys';

/// react-query backed balances hook. SSE-driven invalidation is handled
/// centrally in QueryInvalidator; this short interval keeps the displayed
/// balance feeling live between events (silent background refetch, paused when
/// the tab is hidden). 5s is the live cadence; 1s would hammer the Arc RPC.
export function useBalances() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.balances.me(),
    queryFn: () => api.balances(),
    staleTime: 20_000,
    refetchInterval: 20_000,
  });

  return {
    balances: (query.data?.wallets ?? null) as BalanceRow[] | null,
    fetchedAt: query.data?.fetchedAt ?? null,
    error: query.error ? (query.error as Error).message : null,
    refresh: () => {
      qc.invalidateQueries({ queryKey: qk.balances.me() });
    },
  };
}
