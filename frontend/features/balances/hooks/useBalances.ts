'use client';
import { useEffect, useState } from 'react';
import { api, type BalanceRow } from '@/core/api';
import { useLiveEvents } from '@/shared/hooks/useLiveEvents';

const REFRESH_TRIGGERS = new Set([
  'escrow.approved',
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'bid.submitted',
  'counter.issued',
  'counter.response.submitted',
  'bid.accepted',
]);

export function useBalances() {
  const [balances, setBalances] = useState<BalanceRow[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const events = useLiveEvents(undefined, 20);

  async function load() {
    try {
      const res = await api.balances();
      setBalances(res.wallets);
      setFetchedAt(res.fetchedAt);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (events.length === 0) return;
    if (REFRESH_TRIGGERS.has(events[0]!.type)) {
      const t = setTimeout(load, 1500);
      return () => clearTimeout(t);
    }
  }, [events]);

  return { balances, fetchedAt, error, refresh: load };
}
