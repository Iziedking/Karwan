'use client';

import { useSyncExternalStore } from 'react';

export type SiwePhase =
  | 'idle'
  | 'checking-session'
  | 'awaiting-signature'
  | 'verifying'
  | 'error';

export type SiweError = 'cancelled' | 'unavailable' | null;

export interface SiweSnapshot {
  phase: SiwePhase;
  address: string | null;
  error: SiweError;
}

const IDLE_SNAPSHOT: SiweSnapshot = {
  phase: 'idle',
  address: null,
  error: null,
};

let snapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();

export function getSiweSnapshot(): SiweSnapshot {
  return snapshot;
}

export function publishSiweSnapshot(next: SiweSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function resetSiweSnapshot(): void {
  publishSiweSnapshot(IDLE_SNAPSHOT);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSiweStatus(): SiweSnapshot {
  return useSyncExternalStore(subscribe, getSiweSnapshot, () => IDLE_SNAPSHOT);
}
