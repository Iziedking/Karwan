'use client';

import { createContext, useContext } from 'react';
import type { AdminDeskMe, AdminDeskNetwork } from '@/core/api';
import type { DeskMe } from '@/features/admin/adminNavigation';

export interface DeskState {
  me: AdminDeskMe;
  network: AdminDeskNetwork;
}

const DeskContext = createContext<DeskState | null>(null);

export const DeskProvider = DeskContext.Provider;

export function useDesk(): DeskState {
  const desk = useContext(DeskContext);
  if (!desk) throw new Error('useDesk outside the desk shell');
  return desk;
}

export function deskMe(me: AdminDeskMe): DeskMe {
  return { owner: me.owner, access: me.access ?? {} };
}

/// The desk's colours (Figma, Stripe Dashboard standard, 12 Nov). Pages use
/// them as var(--d-*) so a change lands once.
export const DESK_COLOURS: Record<string, string> = {
  '--d-bg': '#0D0E10',
  '--d-side': '#111215',
  '--d-surface': '#16171A',
  '--d-head': '#141518',
  '--d-line': '#25272C',
  '--d-line-2': '#3A3D44',
  '--d-hover': '#1E2229',
  '--d-button': '#1C1E22',
  '--d-text': '#E8E9EB',
  '--d-text-2': '#A2A5AC',
  '--d-text-3': '#6E727A',
  '--d-lime': '#B3C95A',
  '--d-blue': '#86B6F6',
  '--d-red': '#F2848B',
  '--d-amber': '#EFB44D',
  '--d-green': '#72D49B',
};
