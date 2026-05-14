'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type ChainEvent, type DirectDeal } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

const REFRESH_TYPES = new Set([
  'deal.direct.created',
  'deal.accepted',
  'deal.delivered',
  'escrow.milestone.released',
  'escrow.settled',
  'deal.review.started',
  'deal.review.heartbeat',
  'deal.auto_released',
  'deal.disputed',
  'deal.cancelled',
]);

export function useDirectDeals() {
  const { address, isConnected } = useAccount();
  const [deals, setDeals] = useState<DirectDeal[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  const refresh = useCallback(() => {
    if (!address) return;
    api
      .directDeals(address)
      .then((res) => {
        setDeals(res.deals);
        setFetchState('success');
      })
      .catch(() => setFetchState('error'));
  }, [address]);

  useEffect(() => {
    if (!isConnected || !address) {
      setDeals([]);
      setFetchState('idle');
      return;
    }
    setFetchState('loading');
    refresh();
  }, [address, isConnected, refresh]);

  // SSE: refetch when a relevant deal event lands.
  useEffect(() => {
    if (!isConnected || !address) return;
    const es = new EventSource(api.eventsUrl());
    const onMsg = (raw: MessageEvent) => {
      try {
        const e = JSON.parse(raw.data) as ChainEvent;
        if (REFRESH_TYPES.has(e.type)) {
          // Small delay so the backend has written its store update.
          setTimeout(refresh, 400);
        }
      } catch {
        /* ignore */
      }
    };
    for (const t of REFRESH_TYPES) es.addEventListener(t, onMsg);
    return () => {
      for (const t of REFRESH_TYPES) es.removeEventListener(t, onMsg);
      es.close();
    };
  }, [address, isConnected, refresh]);

  return { deals, fetchState, refresh };
}

export function useDirectDeal(jobId: string) {
  const [deal, setDeal] = useState<DirectDeal | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');

  const refresh = useCallback(() => {
    api
      .directDeal(jobId)
      .then((res) => {
        setDeal(res.deal);
        setFetchState('success');
      })
      .catch(() => setFetchState('error'));
  }, [jobId]);

  useEffect(() => {
    setFetchState('loading');
    refresh();
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource(api.eventsUrl());
    const onMsg = (raw: MessageEvent) => {
      try {
        const e = JSON.parse(raw.data) as ChainEvent;
        if (e.jobId === jobId && REFRESH_TYPES.has(e.type)) {
          setTimeout(refresh, 400);
        }
      } catch {
        /* ignore */
      }
    };
    for (const t of REFRESH_TYPES) es.addEventListener(t, onMsg);
    return () => {
      for (const t of REFRESH_TYPES) es.removeEventListener(t, onMsg);
      es.close();
    };
  }, [jobId, refresh]);

  return { deal, fetchState, refresh };
}
