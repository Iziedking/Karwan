'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from '@/shared/hooks/useAuth';

/// react-query backed deal hooks. Sibling components asking for the same
/// list share a single fetch; cache survives mount + hard refresh through
/// the persister; SSE-driven invalidation lives in QueryInvalidator and
/// matches by `qk.deals.all()` prefix, so no per-hook event subscriptions.

type FetchState = 'idle' | 'loading' | 'success' | 'error';

function stateOf(query: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}, enabled: boolean): FetchState {
  if (!enabled) return 'idle';
  if (query.isError) return 'error';
  if (query.isSuccess) return 'success';
  return 'loading';
}

export function useDirectDeals() {
  const auth = useAuth();
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: qk.deals.list(address),
    queryFn: () => api.directDeals(address!).then((r) => r.deals),
    enabled: isAuthed && !!address,
    /// 30s matches the QueryClient default; named explicitly here so a
    /// future tweak only touches this surface. SSE invalidation pre-empts
    /// the timer anyway whenever a deal lifecycle event lands.
    staleTime: 30_000,
  });

  return {
    deals: (query.data ?? []) as DirectDeal[],
    fetchState: stateOf(query, isAuthed && !!address),
    refresh: () => {
      qc.invalidateQueries({ queryKey: qk.deals.list(address) });
    },
  };
}

export function useDirectDeal(jobId: string) {
  const auth = useAuth();
  const qc = useQueryClient();
  const viewer = auth.address;

  const query = useQuery({
    queryKey: qk.deals.item(jobId, viewer),
    queryFn: () => api.directDeal(jobId, viewer).then((r) => r.deal),
    /// Wait until auth has resolved before the first fetch. Fetching while
    /// auth is still loading sends no caller hint, which the backend reads
    /// as a non-party and returns 403 'private' even on a party's own deal.
    enabled: !auth.isLoading,
    staleTime: 30_000,
    retry: (failureCount, err) => {
      // A 403 'private' is a stable answer for non-parties, never retry it.
      if (err instanceof ApiError && err.code === 'private') return false;
      return failureCount < 1;
    },
  });

  const errorCode =
    query.error instanceof ApiError ? query.error.code : undefined;

  return {
    deal: (query.data ?? null) as DirectDeal | null,
    fetchState: stateOf(query, !auth.isLoading) as FetchState,
    refresh: () => {
      qc.invalidateQueries({ queryKey: qk.deals.item(jobId, viewer) });
    },
    errorCode,
  };
}
