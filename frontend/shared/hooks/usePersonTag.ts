'use client';
import { useEffect, useState } from 'react';
import { api } from '@/core/api';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export type PersonTag =
  | { state: 'none' }
  | { state: 'checking' }
  | { state: 'tag'; tag: string }
  | { state: 'no-tag' };

/// A person a link names by wallet, said by their Karwan tag (owner, 7 Nov
/// 2026: people are named by tag, never by wallet). Anything that is not a
/// wallet address is left to the caller.
export function usePersonTag(raw: string | null | undefined): PersonTag {
  const address = raw && ADDRESS.test(raw.trim()) ? raw.trim().toLowerCase() : null;
  const [found, setFound] = useState<{ address: string; value: PersonTag } | null>(null);

  useEffect(() => {
    if (!address) return;
    let live = true;
    api.getProfile(address).then(
      ({ profile }) => {
        if (!live) return;
        const tag = profile?.handle?.replace(/^@/, '');
        setFound({ address, value: tag ? { state: 'tag', tag } : { state: 'no-tag' } });
      },
      () => { if (live) setFound({ address, value: { state: 'no-tag' } }); },
    );
    return () => { live = false; };
  }, [address]);

  if (!address) return { state: 'none' };
  return found?.address === address ? found.value : { state: 'checking' };
}

export function isWalletAddress(raw: string): boolean {
  return ADDRESS.test(raw.trim());
}
