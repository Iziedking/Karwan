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

/// How a failed deal read should read to the user.
/// - 'private'   : a real 403, the viewer is not a party. Stable, no retry.
/// - 'gone'      : a real 404, the deal id does not exist.
/// - 'transient' : the backend or its database could not answer right now
///                 (network drop, 5xx, timeout, rate limit). The deal is
///                 durably stored and almost certainly fine; this must not
///                 read as "your deal is gone". Retry, then offer a refresh.
export type DealErrorKind = 'private' | 'gone' | 'transient';

function classifyDealError(err: unknown): DealErrorKind {
  if (err instanceof ApiError) {
    if (err.code === 'private' || err.status === 403) return 'private';
    if (err.status === 404) return 'gone';
    // 0 (no response), 408, 429, and any 5xx are not a missing deal.
    return 'transient';
  }
  // A thrown fetch (TypeError) means the request never completed: offline,
  // CORS, DNS, backend down. Never a missing deal.
  return 'transient';
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
      const kind = classifyDealError(err);
      // A non-party 403 is a stable answer; never retry it.
      if (kind === 'private') return false;
      // A transient failure (backend or DB blip) is exactly the case that
      // used to flash "DEAL NOT FOUND" mid-deal. Retry it a few times before
      // giving up so a short outage self-heals without alarming the user.
      if (kind === 'transient') return failureCount < 4;
      // A true 404 on a freshly created agent deal can lag the on-chain
      // event by a beat; one retry covers that without hiding a real miss.
      return failureCount < 1;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  const errorCode =
    query.error instanceof ApiError ? query.error.code : undefined;
  const errorKind: DealErrorKind | undefined = query.isError
    ? classifyDealError(query.error)
    : undefined;

  return {
    deal: (query.data ?? null) as DirectDeal | null,
    fetchState: stateOf(query, !auth.isLoading) as FetchState,
    refresh: () => {
      qc.invalidateQueries({ queryKey: qk.deals.item(jobId, viewer) });
    },
    errorCode,
    errorKind,
    isRefetching: query.isRefetching,
  };
}
