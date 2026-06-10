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

interface Session {
  address: string;
  method: 'circle' | 'web3';
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
  const { address: wagmiAddress, isConnected: wagmiConnected, status: wagmiStatus } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api.authMe();
      if (r.user) {
        setSession({
          address: r.user.address,
          method: r.user.method as 'circle' | 'web3',
          email: r.user.email,
          hasPasskey: !!r.user.hasPasskey,
        });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-check the backend session whenever wagmi reports a new connected address.
  // SIWE runs in useSiwe() and emits AUTH_CHANGED_EVENT on success, which
  // refresh()es; this extra refresh covers the auto-reconnect path where the
  // wagmi address surfaces before any event fires.
  useEffect(() => {
    if (wagmiAddress) refresh();
  }, [wagmiAddress, refresh]);

  // Drop a stale web3 session if wagmi has decisively disconnected. A user can
  // disconnect from RainbowKit's account modal or their wallet extension
  // without going through useAuth.signOut(), which would otherwise leave the
  // backend cookie in place. The result was a confusing half-state: TopNav
  // shows "Sign in" (wagmi disconnected) while the rest of the app still
  // renders authed chrome (cookie still valid). Wait for wagmiStatus to land
  // on 'disconnected' so we don't fight the auto-reconnect on first paint.
  useEffect(() => {
    if (!session) return;
    if (session.method !== 'web3') return;
    if (wagmiStatus !== 'disconnected') return;
    setSession(null);
    api.authLogout().catch(() => {
      /* clear-local-state already done; backend cookie will expire on its own */
    });
    emitAuthChanged();
  }, [session, wagmiStatus]);

  // Sync this instance's circle slice whenever ANY other useAuth() in the app
  // changes the session. Without this, signing out from CircleAccountModal
  // only clears state in that one hook instance. TopNav, BalancesCard, gated
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
    // (Account deletion purges it explicitly, see SettingsBand.)
    //
    // Clear the backend session cookie regardless of method. Both Circle users
    // and post-SIWE web3 users carry a karwan_session cookie; if we only call
    // logout for Circle, a web3 user's session sticks around server-side after
    // they disconnect their wallet and confuses the next visitor on the device.
    try {
      await api.authLogout();
    } catch {
      /* clear local state regardless */
    }
    setSession(null);
    if (wagmiConnected) {
      try {
        await disconnectAsync();
      } catch {
        /* ignore */
      }
    }
    // Broadcast so every other useAuth instance picks up the change.
    emitAuthChanged();
  }, [wagmiConnected, disconnectAsync]);

  const address = session?.address ?? null;
  const method: AuthMethod | null = session?.method ?? null;

  // Mirror the address into the API client so private reads can pass it as a
  // `caller` hint (web3 users have no backend session cookie).
  useEffect(() => {
    setApiCaller(address);
  }, [address]);

  return {
    address,
    method,
    email: session?.email,
    hasPasskey: !!session?.hasPasskey,
    isAuthenticated: !!session,
    isLoading: !loaded,
    signOut,
    refresh,
  };
}
