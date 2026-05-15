'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { api, type UserProfile } from '@/core/api';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// Window event the onboarding page (and anywhere else that mutates the
// profile) dispatches after a save lands. Every useUserProfile consumer
// listens and refetches, so banners like ProfileNudge clear immediately.
export const PROFILE_SAVED_EVENT = 'karwan:profile-saved';

export function useUserProfile() {
  const { address, isConnected } = useAccount();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

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
    // Refetch when the wallet changes, when the user navigates between routes
    // (e.g. returning from /onboarding), or when refresh() is called.
  }, [address, isConnected, pathname, refreshCount]);

  // Cross-component invalidation: any save dispatches a window event and every
  // hook instance refetches in lockstep.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSaved = () => refresh();
    window.addEventListener(PROFILE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PROFILE_SAVED_EVENT, onSaved);
  }, [refresh]);

  return {
    profile,
    address,
    isConnected,
    fetchState,
    loading: fetchState === 'loading' || fetchState === 'idle',
    refresh,
  };
}
