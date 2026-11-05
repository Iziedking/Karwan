'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AgentLimit } from '@/core/api';
import { useAuth } from '@/shared/hooks/useAuth';

/// What the person's agent may spend on checks this week, what it spent and
/// what is left (view 51, third round). Saving is the person's own tap.
export function useAgentLimit() {
  const { address } = useAuth();
  const client = useQueryClient();
  const key = ['money', 'agentLimit', address];
  const query = useQuery({ queryKey: key, queryFn: () => api.agentLimit(), enabled: !!address, staleTime: 30_000 });
  const save = useMutation({
    mutationFn: (weeklyUsdc: number) => api.setAgentLimit(weeklyUsdc),
    onSuccess: (next: AgentLimit) => client.setQueryData(key, next),
  });
  return { limit: query.data ?? null, loading: query.isLoading, failed: query.isError, retry: () => void query.refetch(), save };
}
