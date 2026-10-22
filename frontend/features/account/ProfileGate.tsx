'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DEALS_AVAILABLE } from '@/core/arcNetwork';
import { isChatAccountEmail } from '@/shared/auth/chatAccount';
import { useAuth } from '@/shared/hooks/useAuth';
import { useUserProfile } from '@/shared/hooks/useUserProfile';

/// Where deals are not live on the web (Arc mainnet), /account is the home
/// every deal route redirects to, so it takes over the job /app does on
/// testnet: a signed-in person with no profile finishes sign-up first. An
/// account opened in chat is complete without a web profile and arrives here
/// from the agent's one-time link to withdraw or fund, so it is never sent away.
export function ProfileGate() {
  const { profile, isConnected, fetchState } = useUserProfile();
  const { email } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (DEALS_AVAILABLE || isChatAccountEmail(email)) return;
    if (isConnected && fetchState === 'success' && !profile) {
      router.replace('/start?mode=signup');
    }
  }, [email, fetchState, isConnected, profile, router]);

  return null;
}
