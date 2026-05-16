'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { api } from '@/core/api';

export type AuthMethod = 'web3' | 'circle';

export interface AuthState {
  /// On-chain identity address. For web3 users, comes from wagmi; for circle
  /// users, comes from the session cookie (Circle DCW identity wallet).
  address: string | null;
  method: AuthMethod | null;
  email?: string;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface CircleSession {
  address: string;
  method: 'circle';
  email?: string;
}

/// Single source of truth for "is the user signed in and who are they?".
/// Reads BOTH the wagmi wallet connection AND the circle session cookie,
/// then resolves which one represents the current session.
///
/// Resolution rules:
/// 1. If a circle session is present, it wins (the user explicitly chose
///    passkey login this run).
/// 2. Else if wagmi reports connected, use the wagmi address.
/// 3. Else: not authenticated.
///
/// `signOut` clears whichever path is active so the user can switch methods.
export function useAuth(): AuthState & {
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [circle, setCircle] = useState<CircleSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.authMe();
      if (r.user?.method === 'circle') {
        setCircle({ address: r.user.address, method: 'circle', email: r.user.email });
      } else {
        setCircle(null);
      }
    } catch {
      setCircle(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (circle) {
      try {
        await api.authLogout();
      } catch {
        /* clear local state regardless */
      }
      setCircle(null);
    }
    if (wagmiConnected) {
      try {
        await disconnectAsync();
      } catch {
        /* ignore */
      }
    }
  }, [circle, wagmiConnected, disconnectAsync]);

  const address = circle?.address ?? wagmiAddress ?? null;
  const method: AuthMethod | null = circle ? 'circle' : wagmiConnected ? 'web3' : null;

  return {
    address,
    method,
    email: circle?.email,
    isAuthenticated: !!address,
    isLoading: !loaded,
    signOut,
    refresh,
  };
}
