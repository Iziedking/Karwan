'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAccount, useChainId, useSignMessage } from 'wagmi';
import { api } from '@/core/api';
import { isLandingRoute } from '@/shared/utils/routes';
import { emitAuthChanged } from './useAuth';

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
  state: 'idle' | 'awaiting-signature' | 'verifying' | 'error';
  error: string | null;
  promptSign: () => Promise<void>;
} {
  const { address, isConnected, status: accountStatus } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const pathname = usePathname();

  const stateRef = useRef<{
    inFlight: boolean;
    signedAddress: string | null;
    state: 'idle' | 'awaiting-signature' | 'verifying' | 'error';
    error: string | null;
  }>({ inFlight: false, signedAddress: null, state: 'idle', error: null });

  const runSiwe = async (target: string): Promise<void> => {
    if (stateRef.current.inFlight) return;
    if (stateRef.current.signedAddress === target.toLowerCase()) return;
    stateRef.current.inFlight = true;
    stateRef.current.state = 'awaiting-signature';
    stateRef.current.error = null;
    try {
      // Confirm we don't already have a matching backend session. A user
      // who logged in earlier this run shouldn't re-sign on every page nav.
      const me = await api.authMe().catch(() => ({ user: null }));
      if (me.user && me.user.address.toLowerCase() === target.toLowerCase()) {
        stateRef.current.signedAddress = target.toLowerCase();
        stateRef.current.state = 'idle';
        return;
      }
      // A Circle-session user who connects an external wallet is using it as a
      // signer (e.g. to fund a top-up from their own wallet), not switching
      // accounts. Auto-SIWE would silently replace their Circle session with a
      // web3 one and lose their identity context, so leave the session intact.
      // A wallet user switching accounts still re-signs (method is 'web3').
      if (me.user && me.user.method === 'circle') {
        stateRef.current.state = 'idle';
        return;
      }

      const { message } = await api.siweNonce(target, chainId);
      const signature = await signMessageAsync({ message });
      stateRef.current.state = 'verifying';
      await api.siweVerify(target, signature);
      stateRef.current.signedAddress = target.toLowerCase();
      stateRef.current.state = 'idle';
      emitAuthChanged();
    } catch (err) {
      stateRef.current.state = 'error';
      stateRef.current.error = (err as Error).message ?? 'sign-in failed';
    } finally {
      stateRef.current.inFlight = false;
    }
  };

  useEffect(() => {
    // Landing routes are decoupled from account state: a wallet connecting or
    // switching accounts there must never auto-prompt a SIWE signature. The
    // effect re-runs on route change (pathname is a dep), so the handshake
    // fires the moment the user lands inside the app via Launch app.
    if (isLandingRoute(pathname)) return;
    if (accountStatus !== 'connected') return;
    if (!isConnected || !address) return;
    void runSiwe(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, accountStatus, pathname]);

  // Reset the signed-address pin when the wallet disconnects so a future
  // reconnect re-runs the handshake.
  useEffect(() => {
    if (!isConnected) {
      stateRef.current.signedAddress = null;
      stateRef.current.state = 'idle';
      stateRef.current.error = null;
    }
  }, [isConnected]);

  return {
    state: stateRef.current.state,
    error: stateRef.current.error,
    promptSign: async () => {
      if (address) await runSiwe(address);
    },
  };
}
