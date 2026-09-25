'use client';
import { useEffect } from 'react';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { useUserProfile } from '@/shared/hooks/useUserProfile';

/// Where deals are not live (Arc mainnet before the escrow ships), /account is
/// the home every deal route redirects to, so it takes over the job /app does
/// on testnet: a signed-in person with no profile finishes sign-up first.
export function ProfileGate() {
  const { profile, isConnected, fetchState } = useUserProfile();

  useEffect(() => {
    if (DEALS_AVAILABLE) return;
    if (isConnected && fetchState === 'success' && !profile) {
      window.location.assign('/onboarding');
    }
  }, [fetchState, isConnected, profile]);

  return null;
}
