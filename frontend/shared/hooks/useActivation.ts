'use client';
import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AgentNames } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from './useAuth';

/// Tracks whether the signed-in user (wagmi OR Circle session) has provisioned
/// agent wallets, and exposes activate() + renameAgents() calls. Activation is
/// idempotent on the backend and works for both auth methods.
export function useActivation() {
  const auth = useAuth();
  const qc = useQueryClient();
  const address = auth.address;
  const isConnected = auth.isAuthenticated;
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = isConnected && !!address;
  const query = useQuery({
    queryKey: qk.activation(address),
    queryFn: () => api.activationStatus(address!),
    enabled,
    staleTime: 60_000,
  });
  const status = query.data ?? null;

  const activate = useCallback(
    async (names?: AgentNames) => {
      if (!address) return;
      setActivating(true);
      setError(null);
      try {
        const res = await api.activate(address, names);
        qc.setQueryData(qk.activation(address), res);
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'activation failed');
        throw err;
      } finally {
        setActivating(false);
      }
    },
    [address, qc],
  );

  /// Rename the agents after activation (display-only, no on-chain effect).
  const renameAgents = useCallback(
    async (names: AgentNames) => {
      if (!address) return;
      setActivating(true);
      setError(null);
      try {
        const res = await api.setAgentNames(address, names);
        qc.setQueryData(qk.activation(address), res);
        return res;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'rename failed');
        throw err;
      } finally {
        setActivating(false);
      }
    },
    [address, qc],
  );

  return {
    address,
    isConnected,
    status,
    activated: status?.activated ?? false,
    agents: status?.agents ?? null,
    loading: enabled && query.isPending,
    activating,
    error,
    activate,
    renameAgents,
  };
}
