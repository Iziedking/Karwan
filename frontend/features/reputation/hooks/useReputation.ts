'use client';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Reputation } from '@/core/api';
import { qk } from '@/core/queryKeys';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

/// react-query backed reputation hook. The persister rehydrates the last
/// score from localStorage on mount, so the score paints instantly on
/// refresh; a fresh fetch lands in the background. `refetch` passes
/// `fresh=true` to bypass the backend's 30s reputation cache.
export function useReputation(address?: string | null) {
  const qc = useQueryClient();
  const enabled = !!address;
  const key = address ? qk.reputation(address) : ['reputation', 'anon'];

  const query = useQuery({
    queryKey: key as readonly unknown[],
    queryFn: () => api.reputation(address!),
    enabled,
    staleTime: 30_000,
  });

  const refetch = useCallback(async (): Promise<Reputation | null> => {
    if (!address) return null;
    /// Bypass backend cache. We refetch by calling api.reputation directly
    /// (instead of qc.invalidateQueries) so we can pass the fresh=true
    /// flag the QueryClient doesn't know about; the result still lands in
    /// the cache so observers re-render.
    const res = await api.reputation(address, true);
    qc.setQueryData(qk.reputation(address), res);
    return res;
  }, [address, qc]);

  let fetchState: FetchState = 'idle';
  if (!enabled) fetchState = 'idle';
  else if (query.isError) fetchState = 'error';
  else if (query.isSuccess) fetchState = 'success';
  else fetchState = 'loading';

  return {
    data: (query.data ?? null) as Reputation | null,
    fetchState,
    refetch,
  };
}

export function invalidateReputation(address: string, qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: qk.reputation(address) });
}
