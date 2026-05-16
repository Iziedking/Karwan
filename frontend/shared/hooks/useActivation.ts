'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type ActivationStatus } from '@/core/api';
import { useAuth } from './useAuth';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

/// Tracks whether the signed-in user (wagmi OR Circle session) has provisioned
/// agent wallets, and exposes an activate() call. Activation is idempotent on
/// the backend and works for both auth methods. circle users start without
/// agents too. they just signed up; activation runs the same flow.
export function useActivation() {
  const auth = useAuth();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [status, setStatus] = useState<ActivationStatus | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address) {
      setStatus(null);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .activationStatus(address)
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        setFetchState('success');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(null);
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  const activate = useCallback(async () => {
    if (!address) return;
    setActivating(true);
    setError(null);
    try {
      const res = await api.activate(address);
      setStatus(res);
      setFetchState('success');
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'activation failed');
      throw err;
    } finally {
      setActivating(false);
    }
  }, [address]);

  return {
    address,
    isConnected,
    status,
    activated: status?.activated ?? false,
    agents: status?.agents ?? null,
    loading: fetchState === 'loading' || fetchState === 'idle',
    activating,
    error,
    activate,
  };
}
