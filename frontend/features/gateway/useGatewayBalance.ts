'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, type GatewayBalance } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

/// The caller's pooled Gateway balance. Session-scoped on the backend, cached
/// 30s there, so several surfaces mounting this at once cost one upstream read.
///
/// `confirmed` is what can actually be spent. Pending deposits are visible but
/// not yet spendable, so never gate a top-up button on confirmed + pending.
export function useGatewayBalance() {
  const auth = useAuth();
  const [balance, setBalance] = useState<GatewayBalance | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!auth.address) {
      setBalance(null);
      setLoading(false);
      return;
    }
    try {
      const { balance: b } = await api.getGatewayBalance();
      setBalance(b);
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [auth.address]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /// Drop the server cache, then re-read. Call right after a spend or deposit so
  /// the panel stops serving the pre-move figure.
  const refresh = useCallback(async () => {
    await api.refreshGatewayBalance().catch(() => {});
    await reload();
  }, [reload]);

  return {
    balance,
    confirmed: Number(balance?.confirmed ?? 0),
    pending: Number(balance?.pending ?? 0),
    loading,
    reload,
    refresh,
  };
}
