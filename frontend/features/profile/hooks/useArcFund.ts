'use client';
import { useCallback, useEffect, useState } from 'react';
import { parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { usdcAbi } from '@/features/bridge/abis';
import {
  ARC_CHAIN_ID,
  ARC_USDC_ADDRESS,
  ARC_USDC_DECIMALS,
} from '../config';

export type FundPhase =
  | 'switching'
  | 'signing'
  | 'confirming'
  | 'done'
  | 'error';

export interface FundRecord {
  id: string;
  phase: FundPhase;
  agentKey: 'buyer' | 'seller';
  agentAddress: `0x${string}`;
  amountUsdc: string;
  txHash?: `0x${string}`;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export interface StartFundInput {
  agentKey: 'buyer' | 'seller';
  agentAddress: `0x${string}`;
  amountUsdc: number;
}

const STORAGE_KEY_PREFIX = 'karwan:arc-fund:';
const MAX_HISTORY = 8;

function friendlyFundError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return 'Cancelled in wallet';
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds balance')) {
    return 'Not enough USDC on Arc';
  }
  if (lower.includes('chain mismatch') || lower.includes('does not match the target chain')) {
    return 'Wallet is on the wrong chain. Switch to Arc.';
  }
  if (lower.includes('network') && lower.includes('failed')) {
    return 'Network error. Try again.';
  }
  if (lower.includes('timeout')) {
    return 'Request timed out. Try again.';
  }
  const firstLine = raw.split('\n')[0]?.trim() ?? 'Transfer failed';
  return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine;
}

function storageKey(address?: `0x${string}` | null): string | null {
  if (!address) return null;
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

function loadFromStorage(address?: `0x${string}` | null): FundRecord[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as FundRecord[];
    return arr.map((r) =>
      r.phase === 'switching' || r.phase === 'signing' || r.phase === 'confirming'
        ? { ...r, phase: 'error' as const, error: r.error ?? 'Interrupted on reload. Retry to resume.' }
        : r,
    );
  } catch {
    return [];
  }
}

function saveToStorage(address: `0x${string}` | null | undefined, records: FundRecord[]) {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(records.slice(0, MAX_HISTORY)));
  } catch {
    /* quota — ignore */
  }
}

export function useArcFund() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const arcClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  const [records, setRecords] = useState<FundRecord[]>([]);
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

  const patch = useCallback((id: string, fn: (r: FundRecord) => FundRecord) => {
    setRecords((list) => {
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return list;
      const copy = [...list];
      copy[idx] = { ...fn(copy[idx]!), updatedAt: Date.now() };
      return copy;
    });
  }, []);

  const runFlow = useCallback(
    async (record: FundRecord) => {
      if (!isConnected || !address || !walletClient || !arcClient) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: 'Connect your wallet first' }));
        return;
      }
      const amountWei = parseUnits(record.amountUsdc, ARC_USDC_DECIMALS);

      try {
        if (chainId !== ARC_CHAIN_ID) {
          await switchChainAsync({ chainId: ARC_CHAIN_ID });
        }

        const balance = (await arcClient.readContract({
          address: ARC_USDC_ADDRESS,
          abi: usdcAbi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (balance < amountWei) {
          throw new Error('Not enough USDC on Arc');
        }

        patch(record.id, (r) => ({ ...r, phase: 'signing' }));
        const hash = await walletClient.writeContract({
          address: ARC_USDC_ADDRESS,
          abi: [
            {
              type: 'function',
              name: 'transfer',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'to', type: 'address' },
                { name: 'amount', type: 'uint256' },
              ],
              outputs: [{ type: 'bool' }],
            },
          ] as const,
          functionName: 'transfer',
          args: [record.agentAddress, amountWei],
          chain: walletClient.chain,
          account: address,
        });
        patch(record.id, (r) => ({ ...r, phase: 'confirming', txHash: hash }));
        await arcClient.waitForTransactionReceipt({ hash });
        patch(record.id, (r) => ({ ...r, phase: 'done' }));
      } catch (err) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: friendlyFundError(err) }));
      }
    },
    [address, arcClient, chainId, isConnected, patch, switchChainAsync, walletClient],
  );

  const start = useCallback(
    async (input: StartFundInput) => {
      if (!isConnected || !address) return;
      const id = `${input.agentKey}-${input.agentAddress}-${Date.now()}`;
      const now = Date.now();
      const record: FundRecord = {
        id,
        phase: 'switching',
        agentKey: input.agentKey,
        agentAddress: input.agentAddress,
        amountUsdc: input.amountUsdc.toString(),
        startedAt: now,
        updatedAt: now,
      };
      setRecords((list) => [record, ...list].slice(0, MAX_HISTORY));
      await runFlow(record);
    },
    [address, isConnected, runFlow],
  );

  const retry = useCallback(
    async (id: string) => {
      const cur = records.find((r) => r.id === id);
      if (!cur) return;
      const now = Date.now();
      const fresh: FundRecord = {
        ...cur,
        phase: 'switching',
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
