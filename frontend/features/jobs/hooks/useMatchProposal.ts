'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type MatchProposal } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from '@/shared/hooks/useAuth';

export function useMatchProposal(jobId: string) {
  const { address } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.job.matchProposal(jobId, address),
    queryFn: () => api.matchProposal(jobId).then((r) => r.proposal),
    staleTime: 15_000,
  });

  return {
    proposal: (query.data ?? null) as MatchProposal | null,
    refresh: async () => {
      await qc.invalidateQueries({
        queryKey: qk.job.matchProposal(jobId, address),
      });
    },
  };
}
