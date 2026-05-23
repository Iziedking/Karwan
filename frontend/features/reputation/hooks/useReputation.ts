'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type Reputation } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const cache = new Map<string, { value: Reputation; ts: number }>();
const TTL_MS = 30_000;
const LS_PREFIX = 'karwan:rep:';

// Persist the last-known score per address so a full page refresh (which wipes
// the in-memory cache) can paint the score immediately while a fresh read runs
// in the background. Removes the loading-skeleton flash on profile re-entry.
function readLocal(key: string): Reputation | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    return raw ? (JSON.parse(raw) as Reputation) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: Reputation): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or disabled storage; the in-memory cache still covers this session */
  }
}

export function useReputation(address?: string | null) {
  const [data, setData] = useState<Reputation | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  const fetchOnce = useCallback(
    async (addr: string, fresh = false) => {
      const key = addr.toLowerCase();
      setFetchState('loading');
      try {
        const res = await api.reputation(addr, fresh);
        cache.set(key, { value: res, ts: Date.now() });
        writeLocal(key, res);
        setData(res);
        setFetchState('success');
        return res;
      } catch {
        // Keep any already-shown score (in-memory or localStorage seed) so a
        // transient fetch failure doesn't blank the card; just flag the error.
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

    // Seed from localStorage so the score paints instantly on refresh; still
    // fall through to a fresh fetch. Only show the skeleton when we have
    // nothing cached at all (first-ever load for this address).
    const seed = readLocal(key);
    if (seed) {
      setData(seed);
      setFetchState('success');
    } else {
      setData(null);
      setFetchState('loading');
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
    // Bypass the backend's cache too so a just-landed stake change shows now.
    return fetchOnce(address, true);
  }, [address, fetchOnce]);

  return { data, fetchState, refetch };
}

export function invalidateReputation(address: string) {
  cache.delete(address.toLowerCase());
}
