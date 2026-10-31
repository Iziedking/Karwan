'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Listing, type MarketplaceBrief } from '@/core/api';
import { buildDiscoveryCards, type DiscoveryCard } from '@/features/discovery/model';
import { useAuth } from '@/shared/hooks/useAuth';

export type MarketSource = 'offers' | 'requests';

/// The market's two lists, read together and every 30 seconds. A list that
/// fails keeps what was last read and says so; the other still shows.
export function useMarketData(): {
  cards: DiscoveryCard[];
  loading: boolean;
  refreshing: boolean;
  failed: MarketSource[];
  retry: () => void;
} {
  const { address } = useAuth();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [briefs, setBriefs] = useState<MarketplaceBrief[] | null>(null);
  const [failed, setFailed] = useState<MarketSource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setRefreshing(true);
      const [offers, requests] = await Promise.allSettled([api.listings(), api.marketplaceBriefs()]);
      if (cancelled) return;
      const failures: MarketSource[] = [];
      if (offers.status === 'fulfilled') setListings(offers.value.listings);
      else {
        failures.push('offers');
        setListings((now) => now ?? []);
      }
      if (requests.status === 'fulfilled') setBriefs(requests.value.briefs);
      else {
        failures.push('requests');
        setBriefs((now) => now ?? []);
      }
      setFailed(failures);
      setRefreshing(false);
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reload]);

  const cards = useMemo(() => buildDiscoveryCards(listings ?? [], briefs ?? [], { viewerAddress: address }), [listings, briefs, address]);
  return { cards, loading: listings === null && briefs === null, refreshing, failed, retry: () => setReload((n) => n + 1) };
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
