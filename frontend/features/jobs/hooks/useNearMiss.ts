'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type NearMissApproval } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from '@/shared/hooks/useAuth';

export function useNearMiss(jobId: string) {
  const { address } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.job.nearMiss(jobId, address),
    queryFn: () => api.nearMiss(jobId, address).then((r) => r.nearMiss),
    staleTime: 15_000,
  });

  return {
    nearMiss: (query.data ?? null) as NearMissApproval | null,
    refresh: async () => {
      await qc.invalidateQueries({
        queryKey: qk.job.nearMiss(jobId, address),
      });
    },
  };
}
