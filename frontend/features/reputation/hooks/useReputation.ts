'use client';
import { useEffect, useState } from 'react';
import { api, type Reputation } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const cache = new Map<string, { value: Reputation; ts: number }>();
const TTL_MS = 30_000;

export function useReputation(address?: string | null) {
  const [data, setData] = useState<Reputation | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

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
    setFetchState('loading');
    api
      .reputation(address)
      .then((res) => {
        if (cancelled) return;
        cache.set(key, { value: res, ts: Date.now() });
        setData(res);
        setFetchState('success');
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setFetchState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  return { data, fetchState };
}

export function invalidateReputation(address: string) {
  cache.delete(address.toLowerCase());
}
