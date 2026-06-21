'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';

const POLL_MS = 30_000;
/// Hide cached data once it gets older than this and a refetch is in flight.
/// Without this gate, navigating back to /stake renders the in-memory RQ
/// cache from the previous session (e.g. 4.90 / 5.75 when the truth is now
/// 7.85 / 7.15) for the brief window before the refetch lands. 90s is tight
/// enough that a stale-session value never sneaks in, loose enough that a
/// fresh in-session cache from another tab still renders without a flash.
const HIDE_STALE_AFTER_MS = 90_000;

function isCachedDataFresh(updatedAt: number | undefined): boolean {
  if (!updatedAt) return false;
  return Date.now() - updatedAt < HIDE_STALE_AFTER_MS;
}

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
  const fresh = isCachedDataFresh(query.dataUpdatedAt);
  return {
    /// Hide the cached value once it's older than HIDE_STALE_AFTER_MS while
    /// a refetch is in flight. Stops the stale-session flash on /stake when
    /// the values changed between visits.
    data: fresh ? (query.data ?? null) : null,
    isLoading: query.isPending || (!fresh && query.isFetching),
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
  const fresh = isCachedDataFresh(query.dataUpdatedAt);
  return {
    history: fresh ? (query.data?.history ?? []) : [],
    isLoading: query.isPending || (!fresh && query.isFetching),
    isError: query.isError,
  };
}

/// Live USYC reserves: the protocol's real USYC holdings marked to the live
/// Hashnote price feed. Backs the live USYC balance + yield readout.
export function useUsycReserves() {
  const query = useQuery({
    queryKey: qk.treasury.usyc(),
    queryFn: () => api.usycReserves(),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
  });
  const fresh = isCachedDataFresh(query.dataUpdatedAt);
  return {
    data: fresh ? (query.data ?? null) : null,
    isLoading: query.isPending || (!fresh && query.isFetching),
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
  const fresh = isCachedDataFresh(query.dataUpdatedAt);
  return {
    data: fresh ? (query.data ?? null) : null,
    isLoading: enabled && (query.isPending || (!fresh && query.isFetching)),
    /// Post-claim refresh. The backend `/me` route has a 30s in-memory cache
    /// keyed by address; a plain `invalidateQueries` would refetch but still
    /// hit that stale snapshot. Routing through `fetchQuery` with `fresh: 1`
    /// bypasses the backend cache and writes the live result straight into
    /// the react-query store, so the claim button flips to "Nothing yet"
    /// immediately.
    refresh: async () => {
      if (!address) return;
      try {
        const data = await api.yieldMe(address, { fresh: true });
        qc.setQueryData(qk.yield.me(address), data);
      } catch {
        qc.invalidateQueries({ queryKey: qk.yield.me(address) });
      }
    },
  };
}
