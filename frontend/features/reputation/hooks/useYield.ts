'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';

const POLL_MS = 30_000;

/// Protocol-wide yield reserves (Total distributed / claimed / outstanding).
/// Tiles render from the cached snapshot; SSE has no `yield.*` events, so
/// the polling interval is the freshness floor.
export function useYieldProtocol() {
  const query = useQuery({
    queryKey: qk.yield.protocol(),
    queryFn: () => api.yieldProtocol(),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isError: query.isError,
  };
}

/// Daily distribution history backing the area chart.
export function useYieldHistory() {
  const query = useQuery({
    queryKey: qk.yield.history(),
    queryFn: () => api.yieldHistory(),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  return {
    history: query.data?.history ?? [],
    isLoading: query.isPending,
    isError: query.isError,
  };
}

/// Per-account yield slice. Backs the YieldClaimPanel; takes a wallet
/// address and re-keys on change.
export function useYieldMe(address: string | null | undefined) {
  const qc = useQueryClient();
  const enabled = !!address;
  const query = useQuery({
    queryKey: enabled ? qk.yield.me(address!) : ['yield', 'me', 'anon'],
    queryFn: () => api.yieldMe(address!),
    enabled,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    refresh: () => {
      if (!address) return;
      qc.invalidateQueries({ queryKey: qk.yield.me(address) });
    },
  };
}
