'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api, type UserProfile } from '@/core/api';
import { useAuth } from './useAuth';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// Window event the onboarding page (and anywhere else that mutates the
// profile) dispatches after a save lands. Every useUserProfile consumer
// listens and refetches, so banners like ProfileNudge clear immediately.
export const PROFILE_SAVED_EVENT = 'karwan:profile-saved';

/// Reads the user's profile by the auth-resolved address (web3 wallet OR
/// Circle session, whichever the user signed in with). Returns the address
/// + isConnected shape the rest of the app already consumes.
export function useUserProfile() {
  const auth = useAuth();
  const pathname = usePathname();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>('idle');
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = useCallback(() => setRefreshCount((n) => n + 1), []);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.address) {
      setProfile(null);
      setFetchState('idle');
      return;
    }
    let cancelled = false;
    setFetchState('loading');
    api
      .getProfile(auth.address)
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
    // Refetch on address change, route change (returning from /onboarding),
    // or explicit refresh().
  }, [auth.address, auth.isAuthenticated, pathname, refreshCount]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSaved = () => refresh();
    window.addEventListener(PROFILE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PROFILE_SAVED_EVENT, onSaved);
  }, [refresh]);

  return {
    profile,
    address: auth.address,
    isConnected: auth.isAuthenticated,
    fetchState,
    loading: fetchState === 'loading' || fetchState === 'idle',
    refresh,
  };
}
