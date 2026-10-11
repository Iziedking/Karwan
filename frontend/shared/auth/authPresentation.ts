import type { SiweSnapshot } from './siweState';

export interface AuthSessionIdentity {
  address: string;
  method: 'circle' | 'web3';
}

function sameAddress(left: string | null | undefined, right: string | null | undefined): boolean {
  return !!left && !!right && left.toLowerCase() === right.toLowerCase();
}

/**
 * A Circle session remains the account identity even when an external wallet is
 * connected for funding. A web3 session stays valid while its wallet is locked,
 * absent or reconnecting, so a returning user keeps their account and a way to
 * sign out; the wallet is asked for only when something needs a signature. It
 * stops counting when a different wallet is connected, so the header never
 * shows one wallet while private routes use a cookie belonging to another.
 */
export function sessionMatchesWallet(
  session: AuthSessionIdentity | null,
  wallet: { connected: boolean; address?: string },
): boolean {
  if (!session) return false;
  if (session.method === 'circle') return true;
  return !wallet.connected || sameAddress(session.address, wallet.address);
}

/**
 * A disconnect the person made: the wallet was connected in this tab and now
 * is not. A wallet that never reconnected after a reload (locked or removed
 * extension) is not a sign-out.
 */
export function walletWasDisconnected(previous: string | null, current: string): boolean {
  return previous === 'connected' && current === 'disconnected';
}

/**
 * Hold authenticated route gates while a connected wallet is being promoted to
 * a real Karwan session. If that attempt fails, release the loading state so the
 * sign-in drawer can offer an explicit retry instead of hanging indefinitely.
 */
export function shouldWaitForWalletSession({
  isPublicRoute,
  walletAddress,
  walletConnected,
  session,
  siwe,
}: {
  isPublicRoute: boolean;
  walletAddress?: string;
  walletConnected: boolean;
  session: AuthSessionIdentity | null;
  siwe: SiweSnapshot;
}): boolean {
  if (isPublicRoute || !walletConnected || !walletAddress) return false;
  if (sessionMatchesWallet(session, { connected: walletConnected, address: walletAddress })) {
    return false;
  }

  const failedForThisWallet =
    siwe.phase === 'error' && sameAddress(siwe.address, walletAddress);
  return !failedForThisWallet;
}

/// How long a returning wallet may hold the page while it reconnects. A locked
/// extension never answers, so wagmi stays "reconnecting" until this passes.
/// A live session does not wait at all; this only covers a lapsed one.
export const WALLET_RESOLVE_CAP_MS = 2_000;

export function walletStillResolving(status: string, waitedMs: number): boolean {
  if (status !== 'connecting' && status !== 'reconnecting') return false;
  return waitedMs < WALLET_RESOLVE_CAP_MS;
}
