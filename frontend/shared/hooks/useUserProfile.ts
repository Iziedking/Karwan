'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type UserProfile } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from './useAuth';

type FetchState = 'idle' | 'loading' | 'success' | 'error';

// Window event the onboarding page (and anywhere else that mutates the
// profile) dispatches after a save lands. Every useUserProfile consumer
// listens and refetches, so banners like ProfileNudge clear immediately.
export const PROFILE_SAVED_EVENT = 'karwan:profile-saved';

/// Reads the user's profile by the auth-resolved address (web3 wallet OR
/// Circle session). Returns the address + isConnected shape the rest of
/// the app already consumes.
export function useUserProfile() {
  const auth = useAuth();
  const pathname = usePathname();
  const qc = useQueryClient();
  const enabled = auth.isAuthenticated && !!auth.address;

  const query = useQuery({
    queryKey: qk.profile.me(auth.address),
    queryFn: () => api.getProfile(auth.address!).then((r) => r.profile),
    enabled,
    staleTime: 60_000,
  });

  /// Refetch on route change (returning from /onboarding) — the profile
  /// row may have flipped role / displayName since last fetch.
  useEffect(() => {
    if (!enabled) return;
    qc.invalidateQueries({ queryKey: qk.profile.me(auth.address) });
    // We deliberately list pathname, not the address, so the refetch is
    // scoped to navigation events; address change is already handled by
    // useQuery's key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSaved = () => {
      qc.invalidateQueries({ queryKey: qk.profile.me(auth.address) });
    };
    window.addEventListener(PROFILE_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PROFILE_SAVED_EVENT, onSaved);
  }, [qc, auth.address]);

  let fetchState: FetchState = 'idle';
  if (!enabled) fetchState = 'idle';
  else if (query.isError) fetchState = 'error';
  else if (query.isSuccess) fetchState = 'success';
  else fetchState = 'loading';

  return {
    profile: (query.data ?? null) as UserProfile | null,
    address: auth.address,
    isConnected: auth.isAuthenticated,
    fetchState,
    loading: fetchState === 'loading' || fetchState === 'idle',
    refresh: () => {
      qc.invalidateQueries({ queryKey: qk.profile.me(auth.address) });
    },
  };
}
