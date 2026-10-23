'use client';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { useAccount } from 'wagmi';
import { useAuth } from '@/shared/hooks/useAuth';
import { PASSKEY_CONNECTOR_ID } from '@/features/modularWallet/connector';

/// The caller's pooled Gateway balance, read once and shared: every surface
/// that mounts this reads the same query, so a page with four balance panels
/// makes one request, not four. Cached 30s on the backend as well.
///
/// `confirmed` is what can actually be spent. Pending deposits are visible but
/// not yet spendable, so never gate a top-up button on confirmed + pending.
///
/// Only a plain wallet account has a pool, because Gateway accepts only a plain
/// wallet's signature on a spend. Email accounts and passkey smart accounts
/// hold none (view 23, dropped 23 Oct): for them this reads nothing, reports zero.
export function useGatewayBalance() {
  const auth = useAuth();
  const qc = useQueryClient();
  const address = auth.address?.toLowerCase() ?? null;
  const { connector } = useAccount();
  const hasPool = !!address && auth.method === 'web3' && connector?.id !== PASSKEY_CONNECTOR_ID;
  const key = ['gateway-balance', address] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getGatewayBalance().then((r) => r.balance).catch(() => null),
    enabled: hasPool,
    staleTime: 30_000,
  });

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['gateway-balance', address] });
  }, [qc, address]);

  /// Drop the server cache, then re-read. Call right after a spend or deposit so
  /// the panel stops serving the pre-move figure.
  const refresh = useCallback(async () => {
    await api.refreshGatewayBalance().catch(() => {});
    await reload();
  }, [reload]);

  const balance = hasPool ? query.data ?? null : null;
  return {
    balance,
    confirmed: Number(balance?.confirmed ?? 0),
    pending: Number(balance?.pending ?? 0),
    /// True until the first read lands; a figure that adds the pool waits for it.
    loading: hasPool && query.isPending,
    reload,
    refresh,
  };
}
