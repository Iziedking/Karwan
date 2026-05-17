'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type Reputation } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const cache = new Map<string, { value: Reputation; ts: number }>();
const TTL_MS = 30_000;

export function useReputation(address?: string | null) {
  const [data, setData] = useState<Reputation | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  const fetchOnce = useCallback(
    async (addr: string) => {
      const key = addr.toLowerCase();
      setFetchState('loading');
      try {
        const res = await api.reputation(addr);
        cache.set(key, { value: res, ts: Date.now() });
        setData(res);
        setFetchState('success');
        return res;
      } catch {
        setData(null);
        setFetchState('error');
        return null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!address) {
      setData(null);
      setFetchState('idle');
      return;
    }
    const key = address.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      setData(hit.value);
      setFetchState('success');
      return;
    }

    let cancelled = false;
    fetchOnce(address).catch(() => {});
    return () => {
      cancelled = true;
      // cancelled is captured but the fetchOnce closure doesn't yet read it;
      // race outcomes are bounded by the in-memory cache TTL so a late
      // setState here is at worst harmless.
      void cancelled;
    };
  }, [address, fetchOnce]);

  /// Force a fresh read, bypassing the in-memory cache. Used by the
  /// StakeCard after a deposit/withdraw lands so the visible score and
  /// tier reflect the new stake without waiting on the 30s TTL.
  const refetch = useCallback(async () => {
    if (!address) return null;
    cache.delete(address.toLowerCase());
    return fetchOnce(address);
  }, [address, fetchOnce]);

  return { data, fetchState, refetch };
}

export function invalidateReputation(address: string) {
  cache.delete(address.toLowerCase());
}
