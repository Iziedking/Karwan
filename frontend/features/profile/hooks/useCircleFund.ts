'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/core/api';

/// Circle-side fund flow. Mirrors useArcFund's shape so ArcFundCard can swap
/// between them on `auth.method`, but the phase machine is dramatically
/// simpler: the backend signs the USDC transfer from the user's identity DCW
/// to the agent DCW server-side, no wallet popup or chain switch involved.

export type CircleFundPhase = 'sending' | 'done' | 'error';

export interface CircleFundRecord {
  id: string;
  phase: CircleFundPhase;
  agentKey: 'buyer' | 'seller';
  agentAddress: `0x${string}`;
  amountUsdc: string;
  txHash?: `0x${string}`;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export interface StartCircleFundInput {
  agentKey: 'buyer' | 'seller';
  agentAddress: `0x${string}`;
  amountUsdc: number;
}

const STORAGE_KEY_PREFIX = 'karwan:circle-fund:';
const MAX_HISTORY = 8;

function storageKey(address?: string | null): string | null {
  if (!address) return null;
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

function loadFromStorage(address?: string | null): CircleFundRecord[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CircleFundRecord[];
    return arr.map((r) =>
      r.phase === 'sending'
        ? { ...r, phase: 'error' as const, error: r.error ?? 'Interrupted on reload. Retry to resume.' }
        : r,
    );
  } catch {
    return [];
  }
}

function saveToStorage(address: string | null | undefined, records: CircleFundRecord[]) {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch {
    /* quota, ignore */
  }
}

function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.detail ? String(err.detail) : '';
    if (detail) return detail.length > 140 ? detail.slice(0, 137) + '…' : detail;
    return err.message;
  }
  const raw = err instanceof Error ? err.message : String(err ?? '');
  return raw.length > 140 ? raw.slice(0, 137) + '…' : raw || 'Transfer failed';
}

export function useCircleFund(address: string | null | undefined) {
  const [records, setRecords] = useState<CircleFundRecord[]>([]);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setRecords([]);
      setHydratedFor(null);
      return;
    }
    setRecords(loadFromStorage(address));
    setHydratedFor(address.toLowerCase());
  }, [address]);

  useEffect(() => {
    if (!address) return;
    if (hydratedFor !== address.toLowerCase()) return;
    saveToStorage(address, records);
  }, [address, records, hydratedFor]);

  const patch = useCallback((id: string, fn: (r: CircleFundRecord) => CircleFundRecord) => {
    setRecords((list) => {
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return list;
      const copy = [...list];
      copy[idx] = { ...fn(copy[idx]!), updatedAt: Date.now() };
      return copy;
    });
  }, []);

  const runFlow = useCallback(
    async (record: CircleFundRecord) => {
      if (!address) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: 'Not signed in' }));
        return;
      }
      try {
        const res = await api.fundAgent({
          address,
          agent: record.agentKey,
          amountUsdc: Number(record.amountUsdc),
        });
        patch(record.id, (r) => ({
          ...r,
          phase: 'done',
          txHash: res.txHash as `0x${string}`,
        }));
      } catch (err) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: friendlyError(err) }));
      }
    },
    [address, patch],
  );

  const start = useCallback(
    async (input: StartCircleFundInput) => {
      if (!address) return;
      const id = `${input.agentKey}-${input.agentAddress}-${Date.now()}`;
      const now = Date.now();
      const record: CircleFundRecord = {
        id,
        phase: 'sending',
        agentKey: input.agentKey,
        agentAddress: input.agentAddress,
        amountUsdc: input.amountUsdc.toString(),
        startedAt: now,
        updatedAt: now,
      };
      setRecords((list) => [record, ...list].slice(0, MAX_HISTORY));
      await runFlow(record);
    },
    [address, runFlow],
  );

  const retry = useCallback(
    async (id: string) => {
      const cur = records.find((r) => r.id === id);
      if (!cur) return;
      const now = Date.now();
      const fresh: CircleFundRecord = {
        ...cur,
        phase: 'sending',
        error: undefined,
        txHash: undefined,
        startedAt: now,
        updatedAt: now,
      };
      patch(id, () => fresh);
      await runFlow(fresh);
    },
    [patch, records, runFlow],
  );

  const dismiss = useCallback((id: string) => {
    setRecords((list) => list.filter((r) => r.id !== id));
  }, []);

  return { records, start, retry, dismiss };
}
