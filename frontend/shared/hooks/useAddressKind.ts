'use client';
import { useEffect, useState } from 'react';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { arcTestnet } from '@/core/wagmi';

export type AddressKind = 'idle' | 'invalid' | 'checking' | 'eoa' | 'contract';

interface UseAddressKindOptions {
  /// Addresses to treat as pre-verified — skip the RPC round-trip and resolve
  /// to `eoa` immediately when the input matches one. The bridge + withdraw
  /// surfaces feed the identity wallet and the user's known agent wallets in
  /// so a recognized wallet never has to wait on a chain read.
  trustedAddresses?: readonly (string | undefined | null)[];
  /// How long to wait after the last keystroke before reading code on chain.
  debounceMs?: number;
  /// When false, the hook idles regardless of input. Used to pause checks
  /// while a panel is collapsed or before the user has typed anything.
  enabled?: boolean;
}

/// Resolves whether an EVM address is an externally-owned account (EOA) or a
/// contract on Arc Testnet, so the UI can warn before a user sends funds
/// somewhere that may never return them. Debounced so a paste flicker
/// doesn't fire a half-typed request. Trusted addresses (identity wallet,
/// agent wallets the user owns) short-circuit to `eoa` without a network
/// call.
export function useAddressKind(
  address: string | null | undefined,
  opts: UseAddressKindOptions = {},
): { kind: AddressKind; normalized: `0x${string}` | null } {
  const { trustedAddresses, debounceMs = 350, enabled = true } = opts;
  const [kind, setKind] = useState<AddressKind>('idle');
  const [normalized, setNormalized] = useState<`0x${string}` | null>(null);

  useEffect(() => {
    if (!enabled || !address) {
      setKind('idle');
      setNormalized(null);
      return;
    }
    const trimmed = address.trim();
    if (!isAddress(trimmed)) {
      setKind('invalid');
      setNormalized(null);
      return;
    }
    const checksummed = getAddress(trimmed);
    setNormalized(checksummed);
    const trusted = (trustedAddresses ?? [])
      .filter((a): a is string => typeof a === 'string' && isAddress(a.trim()))
      .map((a) => getAddress(a.trim()));
    if (trusted.includes(checksummed)) {
      setKind('eoa');
      return;
    }
    setKind('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const client = createPublicClient({
          chain: arcTestnet,
          transport: http(),
        });
        const code = await client.getCode({ address: checksummed });
        if (cancelled) return;
        const hasCode = !!code && code !== '0x';
        setKind(hasCode ? 'contract' : 'eoa');
      } catch {
        if (cancelled) return;
        /// Default to `eoa` on RPC failure rather than block the user. The
        /// warning text on Custom still names the risk; the hook just can't
        /// add proof one way or the other.
        setKind('eoa');
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, enabled, debounceMs, trustedAddresses]);

  return { kind, normalized };
}
