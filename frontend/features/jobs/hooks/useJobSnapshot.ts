'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type BuyerJob } from '@/core/api';
import { qk } from '@/core/queryKeys';

/// Job snapshot for the live auction page. The QueryInvalidator handles
/// SSE-driven invalidation on bid/counter/escrow events at the qk.job
/// prefix; this hook just exposes the cache slot.
export function useJobSnapshot(initial: BuyerJob) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.job.snapshot(initial.jobId),
    queryFn: () => api.job(initial.jobId),
    initialData: initial,
    staleTime: 15_000,
  });

  return {
    job: (query.data ?? initial) as BuyerJob,
    refresh: async () => {
      await qc.invalidateQueries({ queryKey: qk.job.snapshot(initial.jobId) });
    },
  };
}
