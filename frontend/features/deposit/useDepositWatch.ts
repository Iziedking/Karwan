'use client';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/core/api';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';

/// The person's own deposit address, for an email or passkey account: USDC
/// sent to it from any network lands in their Karwan balance.
export function useDepositAddress(owner: string | null) {
  const { data } = useQuery({
    queryKey: ['deposit', 'address', owner],
    queryFn: () => api.depositAddress(owner!),
    enabled: !!owner,
    staleTime: Infinity,
  });
  const chains = data?.chains ?? [];
  return { supported: data ? data.supported : null, address: chains[0]?.address ?? null, chains };
}

/// Calls onLanded with the amount when USDC lands in the person's account,
/// straight in or arriving from another network.
export function useFundsLanded(owner: string | null, onLanded: (amountUsdc: string | null) => void) {
  useEffect(() => {
    if (!owner) return;
    const me = owner.toLowerCase();
    return subscribeLiveEvents((event) => {
      const p = (event.payload ?? {}) as { owner?: string; mintRecipient?: string; amountUsdc?: string };
      if (event.type === 'wallet.credited' && p.owner?.toLowerCase() === me) onLanded(p.amountUsdc ?? null);
      if (event.type === 'bridge.minted' && p.mintRecipient?.toLowerCase() === me) onLanded(p.amountUsdc ?? null);
    });
  }, [owner, onLanded]);
}
