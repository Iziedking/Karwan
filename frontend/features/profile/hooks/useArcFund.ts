'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { erc20Abi, parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { ARC_CHAIN_ID, ARC_USDC_ADDRESS, ARC_USDC_DECIMALS } from '../config';
import { api } from '@/core/api';

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
  reference?: string;
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

function friendlyFundError(err: unknown, phase?: FundPhase): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  const rejected =
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request');
  if (rejected) {
    return phase === 'switching' ? 'Chain switch declined. Approve to switch to Arc.' : 'Cancelled in wallet';
  }
  if (phase === 'switching') {
    if (lower.includes('unrecognized chain') || lower.includes('unknown chain') || lower.includes('chain id') ) {
      return 'Wallet does not know Arc Testnet. Add the chain, then retry.';
    }
    return 'Could not switch wallet to Arc. Retry to try again.';
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
    return arr.map((r) => {
      // 'confirming' with a tx hash means the tx is already submitted on chain.
      // Keep it active so the resume effect can poll for the receipt.
      if (r.phase === 'confirming' && r.txHash) return r;
      if (r.phase === 'switching' || r.phase === 'signing' || r.phase === 'confirming') {
        return {
          ...r,
          phase: 'error' as const,
          error: r.error ?? 'Interrupted on reload. Retry to resume.',
        };
      }
      return r;
    });
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
    /* quota, ignore */
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

  const resumeStartedRef = useRef<Set<string>>(new Set());

  const patch = useCallback((id: string, fn: (r: FundRecord) => FundRecord) => {
    setRecords((list) => {
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) return list;
      const copy = [...list];
      copy[idx] = { ...fn(copy[idx]!), updatedAt: Date.now() };
      return copy;
    });
  }, []);

  // Resume any record stuck in 'confirming' from a prior session by polling
  // for the receipt. The tx is already on chain; we just need to learn its fate.
  useEffect(() => {
    if (!arcClient || hydratedFor !== (address?.toLowerCase() ?? '')) return;
    if (!address) return;
    const userAddress = address;
    for (const r of records) {
      if (r.phase !== 'confirming' || !r.txHash) continue;
      if (resumeStartedRef.current.has(r.id)) continue;
      resumeStartedRef.current.add(r.id);
      const txHash = r.txHash;
      arcClient
        .waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
          pollingInterval: 1500,
          retryCount: 8,
        })
        .then((receipt) => {
          if (receipt.status !== 'success') {
            patch(r.id, (cur) => ({ ...cur, phase: 'error', error: 'Transaction reverted on chain' }));
            return;
          }
          void api
            .fundAgentWeb3Complete({
              address: userAddress,
              agent: r.agentKey,
              amountUsdc: r.amountUsdc,
              requestId: r.id,
              txHash,
            })
            .then((completed) => {
              patch(r.id, (cur) => ({
                ...cur,
                phase: 'done',
                reference: completed.reference,
              }));
            })
            .catch((err: unknown) => {
              patch(r.id, (cur) => ({
                ...cur,
                phase: 'error',
                error: err instanceof Error ? err.message : 'Receipt reconciliation needs attention',
              }));
            });
        })
        .catch((err: unknown) => {
          patch(r.id, (cur) => ({
            ...cur,
            phase: 'error',
            error: (err as Error).message ?? 'Receipt lookup failed',
          }));
        });
    }
  }, [arcClient, address, hydratedFor, records, patch]);

  const runFlow = useCallback(
    async (record: FundRecord) => {
      if (!isConnected || !address || !walletClient || !arcClient) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: 'Connect your wallet first' }));
        return;
      }
      const amountMicros = parseUnits(record.amountUsdc, ARC_USDC_DECIMALS);
      // Track which phase the wallet was in when an error was thrown so the
      // error message can be phase-specific (eg. "chain switch declined" vs
      // "transfer cancelled in wallet"). Both originate as user-rejection
      // errors but mean very different things to the user.
      let activePhase: FundPhase = 'switching';

      try {
        // A submitted transaction is never sent again. Reconcile its receipt
        // and the backend movement instead, including after a page reload or
        // a temporary API failure.
        if (record.txHash) {
          activePhase = 'confirming';
          patch(record.id, (r) => ({ ...r, phase: 'confirming' }));
          const receipt = await arcClient.waitForTransactionReceipt({
            hash: record.txHash,
            timeout: 60_000,
            pollingInterval: 1500,
            retryCount: 8,
          });
          if (receipt.status !== 'success') throw new Error('Transaction reverted on chain');
          const completed = await api.fundAgentWeb3Complete({
            address,
            agent: record.agentKey,
            amountUsdc: record.amountUsdc,
            requestId: record.id,
            txHash: record.txHash,
          });
          patch(record.id, (r) => ({
            ...r,
            phase: 'done',
            reference: completed.reference,
          }));
          return;
        }

        const intent = await api.fundAgentWeb3Intent({
          address,
          agent: record.agentKey,
          amountUsdc: record.amountUsdc,
          requestId: record.id,
        });
        patch(record.id, (r) => ({ ...r, reference: intent.reference }));
        if (intent.alreadyRecorded && intent.txHash) {
          patch(record.id, (r) => ({
            ...r,
            phase: 'done',
            txHash: intent.txHash as `0x${string}`,
            reference: intent.reference,
          }));
          return;
        }

        if (chainId !== ARC_CHAIN_ID) {
          // Make sure the record is in 'switching' before the wallet pops.
          // If a retry came in from an 'error' state, the record was patched
          // to 'switching' there too, but if the user is already on Arc the
          // visible phase needs to advance fast so the row doesn't look stuck.
          patch(record.id, (r) => ({ ...r, phase: 'switching' }));
          await switchChainAsync({ chainId: ARC_CHAIN_ID });
        }

        const balance = (await arcClient.readContract({
          address: ARC_USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (balance < amountMicros) {
          throw new Error('Not enough USDC on Arc');
        }

        activePhase = 'signing';
        patch(record.id, (r) => ({ ...r, phase: 'signing' }));
        const hash = await walletClient.writeContract({
          address: ARC_USDC_ADDRESS,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [record.agentAddress, amountMicros],
          chain: walletClient.chain,
          account: address,
        });
        activePhase = 'confirming';
        patch(record.id, (r) => ({ ...r, phase: 'confirming', txHash: hash }));
        // Cap the wait so a flaky RPC doesn't strand the UI. If we time out,
        // the resume effect will pick this record back up on next page load and
        // a one-click Retry continues polling.
        const receipt = await arcClient.waitForTransactionReceipt({
          hash,
          timeout: 60_000,
          pollingInterval: 1500,
          retryCount: 8,
        });
        if (receipt.status !== 'success') throw new Error('Transaction reverted on chain');
        const completed = await api.fundAgentWeb3Complete({
          address,
          agent: record.agentKey,
          amountUsdc: record.amountUsdc,
          requestId: record.id,
          txHash: hash,
        });
        patch(record.id, (r) => ({
          ...r,
          phase: 'done',
          reference: completed.reference,
        }));
      } catch (err) {
        patch(record.id, (r) => ({ ...r, phase: 'error', error: friendlyFundError(err, activePhase) }));
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
