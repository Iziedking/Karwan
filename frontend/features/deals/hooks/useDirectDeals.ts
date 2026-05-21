'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type DirectDeal } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { useAuth } from '@/shared/hooks/useAuth';

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
  // Cancellation proposal lifecycle. Without these, the seller's deal page
  // does not react to a buyer-side propose/decline until manual refresh,
  // even though notifications fire.
  'deal.cancel.proposed',
  'deal.cancel.declined',
]);

export function useDirectDeals() {
  const auth = useAuth();
  const address = auth.address;
  const isAuthed = auth.isAuthenticated;
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
    if (!isAuthed || !address) {
      setDeals([]);
      setFetchState('idle');
      return;
    }
    setFetchState('loading');
    refresh();
  }, [address, isAuthed, refresh]);

  // SSE: refetch when a relevant deal event lands.
  useEffect(() => {
    if (!isAuthed || !address) return;
    return subscribeLiveEvents((e) => {
      if (REFRESH_TYPES.has(e.type)) {
        // Small delay so the backend has written its store update.
        setTimeout(refresh, 400);
      }
    });
  }, [address, isAuthed, refresh]);

  return { deals, fetchState, refresh };
}

export function useDirectDeal(jobId: string) {
  const [deal, setDeal] = useState<DirectDeal | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('loading');
  // Distinguish a privacy 403 ('private') from a genuine miss so the page can
  // say "this deal is private" instead of "not found" to non-parties.
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  const refresh = useCallback(() => {
    api
      .directDeal(jobId)
      .then((res) => {
        setDeal(res.deal);
        setFetchState('success');
        setErrorCode(undefined);
      })
      .catch((err) => {
        setErrorCode(err instanceof ApiError ? err.code : undefined);
        setFetchState('error');
      });
  }, [jobId]);

  useEffect(() => {
    setFetchState('loading');
    refresh();
  }, [refresh]);

  useEffect(() => {
    return subscribeLiveEvents((e) => {
      if (e.jobId === jobId && REFRESH_TYPES.has(e.type)) {
        setTimeout(refresh, 400);
      }
    });
  }, [jobId, refresh]);

  return { deal, fetchState, refresh, errorCode };
}
