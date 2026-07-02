'use client';
import { useCallback, useEffect, useState } from 'react';
import { SOLANA_RPC_URL, SOLANA_USDC_MINT } from '../config';

/// Minimal shape of an injected Solana wallet provider (Phantom and compatible
/// wallets expose this on `window.solana`). We deliberately avoid the full
/// @solana/wallet-adapter stack for now: connect + balance need nothing more
/// than this provider and a JSON-RPC call, so Slice A ships with zero new
/// dependencies and no global provider to break SSR.
interface SolanaProvider {
  isPhantom?: boolean;
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

function getProvider(): SolanaProvider | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { solana?: SolanaProvider };
  return w.solana ?? null;
}

export interface SolanaWallet {
  /// A Solana wallet extension is present in this browser.
  available: boolean;
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
      return;
    }
    setAvailable(true);

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
      setError('No Solana wallet found. Install Phantom to continue.');
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

  return { available, address, connecting, usdcBalance, connect, disconnect, error };
}
