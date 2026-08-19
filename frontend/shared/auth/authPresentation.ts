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
 * connected for funding. A web3 session is only valid for the wallet currently
 * connected in the browser. This prevents the header from showing one wallet
 * while private routes still use a cookie belonging to another.
 */
export function sessionMatchesWallet(
  session: AuthSessionIdentity | null,
  wallet: { connected: boolean; address?: string },
): boolean {
  if (!session) return false;
  if (session.method === 'circle') return true;
  return wallet.connected && sameAddress(session.address, wallet.address);
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
