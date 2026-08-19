'use client';
import { useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { api } from '@/core/api';
import { isLandingRoute } from '@/shared/utils/routes';
import { emitAuthChanged } from './useAuth';
import {
  getSiweSnapshot,
  publishSiweSnapshot,
  resetSiweSnapshot,
  useSiweStatus,
  type SiweError,
  type SiwePhase,
} from '@/shared/auth/siweState';

let inFlight: { address: string; promise: Promise<void> } | null = null;

function classifySiweError(error: unknown): SiweError {
  const candidate = error as { name?: string; code?: number; message?: string };
  if (
    candidate?.name === 'UserRejectedRequestError' ||
    candidate?.name === 'AbortError' ||
    candidate?.code === 4001 ||
    /rejected|declined|cancelled|canceled/i.test(candidate?.message ?? '')
  ) {
    return 'cancelled';
  }
  return 'unavailable';
}

/// Sign-In With Ethereum bridge.
///
/// Wallet users (RainbowKit / wagmi) come back from `useAccount` as
/// "connected" the moment a wallet hands over an address, but a wallet
/// connection alone proves nothing to the backend. Without a real handshake,
/// every server-side surface that gates on `readSession(c)` 401's them. The
/// Terms gate, the deal accept routes, anything the backend wants to attribute
/// to a verified party. The cookie-less `?caller=` shim only covers reads.
///
/// This hook closes that gap. It runs once per wallet connection. When the
/// browser reports a new wagmi address and the backend says no session, it
/// asks the backend for a fresh SIWE nonce, prompts the user to sign the
/// returned message in their wallet, posts the signature back, and lets the
/// backend set the session cookie with `method: 'web3'`.
///
/// The signing prompt body is written for a real person reading the wallet
/// popup. No transaction. No gas. The text says so plainly.
export function useSiwe(): {
  state: SiwePhase;
  error: SiweError;
  promptSign: () => Promise<void>;
} {
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const pathname = usePathname();
  const status = useSiweStatus();

  const runSiwe = useCallback(
    async (target: string): Promise<void> => {
      const normalized = target.toLowerCase();
      if (inFlight?.address === normalized) return inFlight.promise;
      if (inFlight) await inFlight.promise;

      const task = (async () => {
        publishSiweSnapshot({
          phase: 'checking-session',
          address: normalized,
          error: null,
        });
        try {
          // Confirm we don't already have a matching backend session. A user
          // who logged in earlier this run shouldn't re-sign on every page nav.
          const me = await api.authMe().catch(() => ({ user: null }));
          if (me.user && me.user.address.toLowerCase() === normalized) {
            publishSiweSnapshot({ phase: 'idle', address: normalized, error: null });
            return;
          }
          // A Circle-session user who connects an external wallet is using it as
          // a signer for an explicit action, not switching account identity.
          if (me.user && me.user.method === 'circle') {
            publishSiweSnapshot({ phase: 'idle', address: normalized, error: null });
            return;
          }

          const { message } = await api.siweNonce(target, chainId);
          publishSiweSnapshot({
            phase: 'awaiting-signature',
            address: normalized,
            error: null,
          });
          const signature = await signMessageAsync({ message });
          publishSiweSnapshot({ phase: 'verifying', address: normalized, error: null });
          await api.siweVerify(target, signature);
          publishSiweSnapshot({ phase: 'idle', address: normalized, error: null });
          emitAuthChanged();
        } catch (error) {
          publishSiweSnapshot({
            phase: 'error',
            address: normalized,
            error: classifySiweError(error),
          });
        }
      })();

      inFlight = { address: normalized, promise: task };
      try {
        await task;
      } finally {
        if (inFlight?.promise === task) inFlight = null;
      }
    },
    [chainId, signMessageAsync],
  );

  useEffect(() => {
    // Landing routes are decoupled from account state: a wallet connecting or
    // switching accounts there must never auto-prompt a SIWE signature. The
    // effect re-runs on route change (pathname is a dep), so the handshake
    // fires the moment the user lands inside the app via Launch app.
    if (isLandingRoute(pathname)) return;
    if (accountStatus !== 'connected') return;
    if (!isConnected || !address) return;
    const current = getSiweSnapshot();
    if (current.phase === 'error' && current.address === address.toLowerCase()) return;
    void runSiwe(address);
  }, [isConnected, address, accountStatus, pathname, runSiwe]);

  // Reset the signed-address pin when the wallet disconnects so a future
  // reconnect re-runs the handshake.
  useEffect(() => {
    if (!isConnected) {
      resetSiweSnapshot();
    }
  }, [isConnected]);

  return {
    state: status.phase,
    error: status.error,
    promptSign: async () => {
      if (address) await runSiwe(address);
    },
  };
}
