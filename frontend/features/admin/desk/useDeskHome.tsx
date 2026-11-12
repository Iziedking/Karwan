'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type AdminHomeView } from '@/core/api';

const EVERY_MS = 2 * 60_000;

interface DeskHomeState {
  home: AdminHomeView | null;
  failed: boolean;
  refresh: () => Promise<void>;
}

const DeskHomeContext = createContext<DeskHomeState | null>(null);

/// Home's answer, shared by the Home page and the sidebar's counts; read on
/// sign-in and every two minutes.
export function DeskHomeProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState<AdminHomeView | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHome(await api.adminHome());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), EVERY_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return <DeskHomeContext.Provider value={{ home, failed, refresh }}>{children}</DeskHomeContext.Provider>;
}

export function useDeskHome(): DeskHomeState {
  const state = useContext(DeskHomeContext);
  if (!state) throw new Error('useDeskHome outside the desk shell');
  return state;
}
