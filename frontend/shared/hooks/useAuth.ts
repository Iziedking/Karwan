'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';
import { api, setApiCaller } from '@/core/api';

export type AuthMethod = 'web3' | 'circle';

export interface AuthState {
  /// On-chain identity address. For web3 users, comes from wagmi; for circle
  /// users, comes from the session cookie (Circle DCW identity wallet).
  address: string | null;
  method: AuthMethod | null;
  email?: string;
  /// True when a Circle user has at least one passkey credential on their
  /// account. Always false for web3 wallet users.
  hasPasskey: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface CircleSession {
  address: string;
  method: 'circle';
  email?: string;
  hasPasskey: boolean;
}

/// Window event fired whenever the auth state changes (sign in or sign out).
/// Every useAuth() instance subscribes and refetches so the UI stays in sync
/// across every component that displays auth-derived data. Sign-in dispatches
/// from LoginModal after authLoginVerify/authOtpVerify lands; sign-out from
/// useAuth.signOut() after authLogout lands.
export const AUTH_CHANGED_EVENT = 'karwan:auth-changed';

export function emitAuthChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
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
        setCircle({
          address: r.user.address,
          method: 'circle',
          email: r.user.email,
          hasPasskey: !!r.user.hasPasskey,
        });
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

  // Sync this instance's circle slice whenever ANY other useAuth() in the app
  // changes the session. Without this, signing out from CircleAccountModal
  // only clears state in that one hook instance — TopNav, BalancesCard, gated
  // pages, etc. keep showing stale "signed in" UI until the user reloads.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onChange = () => {
      refresh();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onChange);
  }, [refresh]);

  const signOut = useCallback(async () => {
    // The bell's localStorage cache is intentionally kept across sign-out: it is
    // keyed per account address, so a different account that signs in next won't
    // see it, and the same account that returns keeps its read/unread state.
    // (Account deletion purges it explicitly — see SettingsBand.)
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
    // Broadcast so every other useAuth instance picks up the change.
    emitAuthChanged();
  }, [circle, wagmiConnected, wagmiAddress, disconnectAsync]);

  const address = circle?.address ?? wagmiAddress ?? null;
  const method: AuthMethod | null = circle ? 'circle' : wagmiConnected ? 'web3' : null;

  // Mirror the address into the API client so private reads can pass it as a
  // `caller` hint (web3 users have no backend session cookie).
  useEffect(() => {
    setApiCaller(address);
  }, [address]);

  return {
    address,
    method,
    email: circle?.email,
    hasPasskey: !!circle?.hasPasskey,
    isAuthenticated: !!address,
    isLoading: !loaded,
    signOut,
    refresh,
  };
}
