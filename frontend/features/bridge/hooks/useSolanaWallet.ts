'use client';
import { useCallback, useEffect, useState } from 'react';
import { SOLANA_RPC_URL, SOLANA_USDC_MINT } from '../config';
import { getPhantomProvider, getConflictingWalletName } from '../solanaProvider';

/// Provider resolution lives in solanaProvider.ts: `window.solana` is a legacy
/// alias any extension can claim, so it is never trusted without `isPhantom`.
/// We avoid the full @solana/wallet-adapter stack: connect + balance need only
/// the provider and a JSON-RPC call.
const getProvider = getPhantomProvider;

export interface SolanaWallet {
  /// Phantom is present in this browser.
  available: boolean;
  /// A Solana wallet IS installed but it is not Phantom. The burn is built by
  /// hand and only Phantom is known to sign it, so name the one we found rather
  /// than handing it a transaction it will hang on.
  conflictingWallet: string | null;
  address: string | null;
  connecting: boolean;
  /// SPL USDC balance as a decimal string, null until the first read.
  usdcBalance: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  error: string | null;
}

/// Read the connected wallet's USDC SPL balance over JSON-RPC. Sums every USDC
/// token account the owner holds (there is usually just the one ATA). Returns
/// '0' when the owner has no USDC account yet, null on a read failure.
async function readUsdcBalance(owner: string): Promise<string | null> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [owner, { mint: SOLANA_USDC_MINT }, { encoding: 'jsonParsed' }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: {
        value?: Array<{
          account?: { data?: { parsed?: { info?: { tokenAmount?: { uiAmountString?: string } } } } };
        }>;
      };
    };
    const accounts = json.result?.value ?? [];
    if (accounts.length === 0) return '0';
    let total = 0;
    for (const a of accounts) {
      const ui = a.account?.data?.parsed?.info?.tokenAmount?.uiAmountString;
      if (ui) total += Number(ui);
    }
    return String(total);
  } catch {
    return null;
  }
}

/// Connect + read balance for an injected Solana wallet. No signing here; the
/// burn lands in Slice B. Kept isolated from wagmi so the two wallet worlds
/// never collide.
export function useSolanaWallet(): SolanaWallet {
  const [available, setAvailable] = useState(false);
  const [conflictingWallet, setConflictingWallet] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detect the provider, reconnect if the user already trusted this site, and
  // track account/disconnect changes from the wallet itself.
  useEffect(() => {
    const provider = getProvider();
    if (!provider) {
      setAvailable(false);
      setConflictingWallet(getConflictingWalletName());
      return;
    }
    setAvailable(true);
    setConflictingWallet(null);

    const syncFrom = (pk: { toString(): string } | null | undefined) => {
      setAddress(pk ? pk.toString() : null);
    };

    // Silent reconnect: only prompts if the site was previously trusted.
    provider.connect({ onlyIfTrusted: true }).then(
      (r) => syncFrom(r.publicKey),
      () => {
        /* not trusted yet; wait for an explicit connect */
      },
    );

    const onConnect = (...args: unknown[]) => {
      const pk = args[0] as { toString(): string } | undefined;
      syncFrom(pk ?? provider.publicKey ?? null);
    };
    const onDisconnect = () => setAddress(null);
    const onAccountChanged = (...args: unknown[]) => {
      const pk = args[0] as { toString(): string } | null | undefined;
      syncFrom(pk ?? null);
    };
    provider.on('connect', onConnect);
    provider.on('disconnect', onDisconnect);
    provider.on('accountChanged', onAccountChanged);
    return () => {
      provider.removeListener?.('connect', onConnect);
      provider.removeListener?.('disconnect', onDisconnect);
      provider.removeListener?.('accountChanged', onAccountChanged);
    };
  }, []);

  // Poll the USDC balance while connected so a fresh top-up shows up.
  useEffect(() => {
    if (!address) {
      setUsdcBalance(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      readUsdcBalance(address).then((b) => {
        if (!cancelled) setUsdcBalance(b);
      });
    };
    load();
    // Poll every 5s so a fresh faucet claim shows up without a page refresh.
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [address]);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      const other = getConflictingWalletName();
      setError(
        other
          ? `${other} is handling Solana in this browser. Karwan needs Phantom for this transfer. Turn the other one off, or install Phantom.`
          : 'No Solana wallet found. Install Phantom to continue.',
      );
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const r = await provider.connect();
      setAddress(r.publicKey.toString());
    } catch {
      // User closed the popup or declined. Stay disconnected, no scary error.
      setError(null);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const provider = getProvider();
    try {
      await provider?.disconnect();
    } catch {
      /* ignore */
    }
    setAddress(null);
  }, []);

  return { available, conflictingWallet, address, connecting, usdcBalance, connect, disconnect, error };
}
