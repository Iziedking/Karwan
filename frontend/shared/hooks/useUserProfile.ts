'use client';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { api, type UserProfile } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

export function useUserProfile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');

  useEffect(() => {
    if (!isConnected || !address) {
      setProfile(null);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .getProfile(address)
      .then((res) => {
        if (cancelled) return;
        setProfile(res.profile);
        setFetchState('success');
      })
      .catch(() => {
        if (cancelled) return;
        setProfile(null);
        setFetchState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [address, isConnected]);

  return {
    profile,
    address,
    isConnected,
    fetchState,
    loading: fetchState === 'loading' || fetchState === 'idle',
  };
}
