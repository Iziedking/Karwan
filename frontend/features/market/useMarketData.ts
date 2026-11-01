'use client';

import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type MarketplaceBrief } from '@/core/api';
import { buildDiscoveryCards, type DiscoveryCard, type DiscoveryScope } from '@/features/discovery/model';
import { useAuth } from '@/shared/hooks/useAuth';
import type { CategoryId } from './marketModel';

export type MarketSource = 'offers' | 'requests';

const REFRESH_MS = 30_000;
const SEARCH_PAUSE_MS = 250;

/// The Buy side's offers, one page asked of the server (view 44): only what the
/// page shows, narrowed and searched there, every 30 seconds. While a new page
/// loads the last one stays on screen, and a page saved from the last visit
/// paints at once. `total` is how many matched in all.
export function useMarketOffers(f: { q: string; category: CategoryId | 'all'; scope: DiscoveryScope; limit: number }): {
  cards: DiscoveryCard[];
  total: number | null;
  loading: boolean;
  refreshing: boolean;
  failed: boolean;
  retry: () => void;
} {
  const { address } = useAuth();
  const q = useSettled(f.q.trim(), SEARCH_PAUSE_MS);
  const query = useQuery({
    queryKey: ['market', 'offers', { q, category: f.category, scope: f.scope, limit: f.limit }],
    queryFn: () => api.marketOffers({ q, category: f.category, scope: f.scope, limit: f.limit }),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: REFRESH_MS,
  });
  const listings = query.data?.listings;
  const cards = useMemo(() => buildDiscoveryCards(listings ?? [], [], { viewerAddress: address }), [listings, address]);
  return {
    cards,
    total: query.data?.total ?? null,
    loading: !query.data && query.isPending,
    refreshing: query.isFetching,
    failed: query.isError && !query.data,
    retry: () => void query.refetch(),
  };
}

/// The Sell side's open requests, read every 30 seconds. A failed read keeps
/// what was last read and says so.
export function useMarketRequests(): {
  cards: DiscoveryCard[];
  loading: boolean;
  refreshing: boolean;
  failed: MarketSource[];
  retry: () => void;
} {
  const { address } = useAuth();
  const [briefs, setBriefs] = useState<MarketplaceBrief[] | null>(null);
  const [failed, setFailed] = useState<MarketSource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRefreshing(true);
      const requests = await api.marketplaceBriefs().then((r) => r.briefs, () => null);
      if (cancelled) return;
      if (requests) setBriefs(requests);
      else setBriefs((now) => now ?? []);
      setFailed(requests ? [] : ['requests']);
      setRefreshing(false);
    }
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reload]);

  const cards = useMemo(() => buildDiscoveryCards([], briefs ?? [], { viewerAddress: address }), [briefs, address]);
  return { cards, loading: briefs === null, refreshing, failed, retry: () => setReload((n) => n + 1) };
}

/// The value once it has stopped changing for `ms`, so typing a search asks
/// the server once rather than per keystroke.
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/// The open requests the signed-in seller fits. Signed out, nothing is asked.
export function useRequestFits(enabled: boolean): ReadonlySet<string> | null {
  const { address, isAuthenticated } = useAuth();
  const on = enabled && isAuthenticated && !!address;
  const query = useQuery({
    queryKey: ['listing-fits', address?.toLowerCase()],
    queryFn: () => api.listingFits(address!).then((r) => new Set(r.jobIds.map((id) => id.toLowerCase()))),
    enabled: on,
    staleTime: 60_000,
  });
  return on ? query.data ?? null : null;
}
