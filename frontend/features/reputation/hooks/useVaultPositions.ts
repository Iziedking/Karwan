'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/core/api';
import { qk } from '@/core/queryKeys';

/// react-query backed staking positions. The 10s polling interval matches
/// the prior StakeCard cadence; central QueryInvalidator handles deal-tied
/// reservation changes; the `refresh(true)` path passes `fresh=true` to
/// kick the backend's vault scan synchronously after a deposit/withdraw.
export function useVaultPositions(address: string | null | undefined) {
  const qc = useQueryClient();
  const enabled = !!address;

  const query = useQuery({
    queryKey: enabled
      ? qk.vault.positions(address!)
      : ['vault', 'positions', 'anon'],
    queryFn: () => api.vaultPositions(address!),
    enabled,
    staleTime: 10_000,
    refetchInterval: 10_000,
  });

  const refresh = async (fresh = false): Promise<void> => {
    if (!address) return;
    if (fresh) {
      /// fetch directly with the force-fresh flag and write the result
      /// into the cache; using invalidate alone would let the cached
      /// stale value race the new fetch.
      const next = await api.vaultPositions(address, true);
      qc.setQueryData(qk.vault.positions(address), next);
    } else {
      await qc.invalidateQueries({ queryKey: qk.vault.positions(address) });
    }
  };

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    refresh,
  };
}
