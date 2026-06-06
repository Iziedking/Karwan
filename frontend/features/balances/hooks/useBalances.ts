'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BalanceRow } from '@/core/api';
import { qk } from '@/core/queryKeys';

/// react-query backed balances hook. SSE-driven invalidation is handled
/// centrally in QueryInvalidator; the 15s polling interval is the floor
/// for stale-state detection between events.
export function useBalances() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.balances.me(),
    queryFn: () => api.balances(),
    staleTime: 15_000,
    refetchInterval: 15_000,
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
