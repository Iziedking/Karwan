import { QueryClient } from '@tanstack/react-query';

/// Single QueryClient factory. Defaults are tuned for a read-heavy SaaS
/// surface that backs every screen with view-function reads off Arc:
///
/// - staleTime 30s — matches the backend cache TTL on reputation and yield.
///   While fresh, two sibling components that ask for the same key see one
///   shared fetch and the second mount paints from cache instantly. The
///   home book stopped flashing once this landed.
/// - gcTime 24h — keep cached data around through tab navigation; the
///   persister hands the same blob back on a hard refresh.
/// - refetchOnWindowFocus false — refetching every tab focus thrashed the
///   Arc public RPC and added no signal; SSE + interval polling cover live
///   updates. SSE invalidate is the source of truth for "data may have
///   changed."
/// - refetchOnReconnect true — networks come back, refetch once.
/// - retry 1 — bounded retry; Arc RPC has sporadic 502s. More than 1 just
///   delays the error display without changing the outcome.
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
