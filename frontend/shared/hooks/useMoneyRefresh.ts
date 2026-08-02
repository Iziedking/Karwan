'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/core/queryKeys';

/// Refresh every money surface right now.
///
/// For a wallet-signed transaction the browser learns the outcome FIRST: it is
/// holding the hash and awaiting the receipt. Waiting for the backend to notice
/// the same event over SSE, and only then refetching, throws that head start
/// away and leaves the user watching a stale number for a second or two after
/// their own action visibly succeeded.
///
/// Call this once the receipt is in. SSE invalidation still runs and is still
/// what covers money moved by anyone else; this is only the shortcut for the
/// case where we already know.
///
/// Both key spaces, because they are genuinely separate caches: `qk.*` is this
/// app's backend-backed data, and `['balance']` is wagmi's chain reads.
export function useMoneyRefresh(): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: qk.balances.all() });
    qc.invalidateQueries({ queryKey: ['balance'] });
  }, [qc]);
}
