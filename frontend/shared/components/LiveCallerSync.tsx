'use client';
import { useEffect } from 'react';
import { useAuth } from '@/shared/hooks/useAuth';
import { setLiveCaller } from '@/shared/utils/liveEventBus';

/// Keeps the shared live-event stream scoped to the signed-in user. The stream
/// is gated server-side by the authenticated session (full detail for the
/// caller's own deals, a privacy pulse otherwise), so on sign in / out we
/// re-handshake the connection with the new session. Renders nothing.
export function LiveCallerSync() {
  const { address, isAuthenticated } = useAuth();
  useEffect(() => {
    setLiveCaller(isAuthenticated && address ? address : null);
  }, [address, isAuthenticated]);
  return null;
}
