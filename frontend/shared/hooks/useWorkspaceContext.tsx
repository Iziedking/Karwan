'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Workspace } from '@/core/api';
import { qk } from '@/core/queryKeys';
import { useAuth } from './useAuth';

const ACTIVE_WORKSPACE_KEY = 'karwan:active-workspace';

function activeWorkspaceKey(address?: string | null): string {
  return address ? `${ACTIVE_WORKSPACE_KEY}:${address.toLowerCase()}` : ACTIVE_WORKSPACE_KEY;
}

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isBusinessWorkspace: boolean;
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refresh: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { address, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: qk.workspaces.me(address),
    queryFn: () => api.getWorkspaces(),
    enabled: isAuthenticated && !!address,
    staleTime: 60_000,
  });

  useEffect(() => {
    setSelectedId(null);
    if (typeof window === 'undefined') return;
    setSelectedId(window.localStorage.getItem(activeWorkspaceKey(address)));
  }, [address]);

  const workspaces = query.data?.workspaces ?? [];
  const activeWorkspace = useMemo(() => {
    if (selectedId) {
      const selected = workspaces.find((workspace) => workspace.id === selectedId);
      if (selected) return selected;
    }
    return workspaces.find((workspace) => workspace.kind === 'personal') ?? workspaces[0] ?? null;
  }, [selectedId, workspaces]);

  const switchWorkspace = useCallback((workspaceId: string) => {
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return;
    setSelectedId(workspaceId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(activeWorkspaceKey(address), workspaceId);
      window.dispatchEvent(new CustomEvent('karwan:workspace-changed', { detail: { workspaceId } }));
    }
    queryClient.invalidateQueries({ queryKey: qk.workspaces.availability(workspaceId) });
  }, [address, queryClient, workspaces]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    workspaces,
    activeWorkspace,
    isBusinessWorkspace: activeWorkspace?.kind === 'business',
    isLoading: query.isPending,
    switchWorkspace,
    refresh: () => { void queryClient.invalidateQueries({ queryKey: qk.workspaces.me(address) }); },
  }), [activeWorkspace, address, query.isPending, queryClient, switchWorkspace, workspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspaceContext must be used within WorkspaceProvider');
  return context;
}
