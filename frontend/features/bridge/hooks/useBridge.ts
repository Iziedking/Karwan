'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { api, type ChainEvent } from '@/core/api';
import { ARC_TESTNET, SOURCE_CHAINS, addressToBytes32, FINALITY_THRESHOLD_FAST, type SourceChainConfig } from '../config';
import { tokenMessengerV2Abi, usdcAbi } from '../abis';
import { sfx } from '@/shared/utils/sfx';

const USDC_DECIMALS = 6;
const STORAGE_KEY_PREFIX = 'karwan:bridges:';
const MAX_HISTORY = 8;

function friendlyBridgeError(err: unknown, source: SourceChainConfig): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return 'Cancelled in wallet';
  }
  if (lower.includes('insufficient funds') && lower.includes('gas')) {
    return `Not enough ETH on ${source.name} for gas`;
  }
  if (lower.includes('transfer amount exceeds balance') || lower.includes('insufficient balance') || lower.includes('erc20: transfer amount')) {
    return `Not enough USDC on ${source.name}`;
  }
  if (lower.includes('allowance') && lower.includes('returned no data')) {
    return 'Wrong network detected. Switch to the source chain and try again.';
  }
  if (lower.includes('chain mismatch') || lower.includes('does not match the target chain')) {
    return `Wallet is on the wrong chain. Switch to ${source.name}.`;
  }
  if (lower.includes('network') && lower.includes('failed')) {
    return 'Network error. Try again.';
  }
  if (lower.includes('timeout')) {
    return 'Request timed out. Try again.';
  }
  const firstLine = raw.split('\n')[0]?.trim() ?? 'Bridge failed';
  return firstLine.length > 140 ? firstLine.slice(0, 137) + '…' : firstLine;
}

export type BridgePhase =
  | 'switching'
  | 'approving'
  | 'burning'
  | 'relaying'
  | 'attesting'
  | 'minting'
  | 'done'
  | 'error';

export interface BridgeRecord {
  id: string;
  phase: BridgePhase;
  sourceChainKey: SourceChainConfig['key'];
  amountUsdc: string;
  mintRecipient: `0x${string}`;
  approveTxHash?: `0x${string}`;
  burnTxHash?: `0x${string}`;
  mintTxHash?: `0x${string}`;
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export interface StartBridgeInput {
  sourceChainKey: SourceChainConfig['key'];
  amountUsdc: number;
  mintRecipient: `0x${string}`;
}

const ACTIVE_PHASES: BridgePhase[] = [
  'switching',
  'approving',
  'burning',
  'relaying',
  'attesting',
  'minting',
];

function isActive(phase: BridgePhase): boolean {
  return ACTIVE_PHASES.includes(phase);
}

function storageKey(address?: `0x${string}` | null): string | null {
  if (!address) return null;
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

function loadFromStorage(address: `0x${string}` | null | undefined): BridgeRecord[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BridgeRecord[];
    // Wallet-local async state is lost on reload. Anything mid-sign becomes 'error'
    // so the user can retry cleanly. Attesting/minting bridges continue via SSE.
    return arr.map((b) => {
      if (b.phase === 'switching' || b.phase === 'approving' || b.phase === 'burning' || b.phase === 'relaying') {
        return { ...b, phase: 'error' as const, error: b.error ?? 'Interrupted on reload. Retry to resume.' };
      }
      return b;
    });
  } catch {
    return [];
  }
}

function saveToStorage(address: `0x${string}` | null | undefined, bridges: BridgeRecord[]) {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(bridges.slice(0, MAX_HISTORY)));
  } catch {
    /* quota, ignore */
  }
}

export function useBridges() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const baseSepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.baseSepolia.chainId });
  const sepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.sepolia.chainId });

  const [bridges, setBridges] = useState<BridgeRecord[]>([]);
  // Tracks whether we've already loaded localStorage for the current address.
  // Prevents the save effect from wiping storage with the empty initial state
  // before hydrate completes on the first render after wagmi resolves.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const bridgesRef = useRef(bridges);
  bridgesRef.current = bridges;

  // Hydrate from localStorage once the wallet address is known.
  useEffect(() => {
    if (!address) {
      setBridges([]);
      setHydratedFor(null);
      return;
    }
    setBridges(loadFromStorage(address));
    setHydratedFor(address.toLowerCase());
  }, [address]);

  // Persist only after hydrate has completed for this address, otherwise we'd
  // overwrite saved bridges with the empty initial state on the first commit.
  useEffect(() => {
    if (!address) return;
    if (hydratedFor !== address.toLowerCase()) return;
    saveToStorage(address, bridges);
  }, [address, bridges, hydratedFor]);

  // Single SSE subscription routes bridge events to the right record by bridgeId.
  useEffect(() => {
    if (!isConnected) return;
    const es = new EventSource(api.eventsUrl());
    const onMsg = (raw: MessageEvent) => {
      try {
        const e = JSON.parse(raw.data) as ChainEvent;
        const bId = (e.payload?.bridgeId as string | undefined) ?? undefined;
        if (!bId) return;
        setBridges((list) => {
          const idx = list.findIndex((b) => b.id === bId);
          if (idx < 0) return list;
          const cur = list[idx]!;
          let next: BridgeRecord = cur;
          if (e.type === 'bridge.attested') {
            next = { ...cur, phase: 'minting', updatedAt: Date.now() };
          } else if (e.type === 'bridge.minted') {
            next = {
              ...cur,
              phase: 'done',
              mintTxHash: e.payload?.txHash as `0x${string}` | undefined,
              updatedAt: Date.now(),
            };
            if (cur.phase !== 'done') sfx.success();
          } else if (e.type === 'bridge.error') {
            next = {
              ...cur,
              phase: 'error',
              error: (e.payload?.message as string | undefined) ?? 'Bridge failed',
              updatedAt: Date.now(),
            };
          } else {
            return list;
          }
          const copy = [...list];
          copy[idx] = next;
          return copy;
        });
      } catch {
        /* ignore */
      }
    };
    es.addEventListener('bridge.attested', onMsg);
    es.addEventListener('bridge.minted', onMsg);
    es.addEventListener('bridge.error', onMsg);
    return () => {
      es.removeEventListener('bridge.attested', onMsg);
      es.removeEventListener('bridge.minted', onMsg);
      es.removeEventListener('bridge.error', onMsg);
      es.close();
    };
  }, [isConnected]);

  const patch = useCallback((id: string, fn: (b: BridgeRecord) => BridgeRecord) => {
    setBridges((list) => {
      const idx = list.findIndex((b) => b.id === id);
      if (idx < 0) return list;
      const copy = [...list];
      copy[idx] = { ...fn(copy[idx]!), updatedAt: Date.now() };
      return copy;
    });
  }, []);

  const runFlow = useCallback(
    async (record: BridgeRecord) => {
      const source = SOURCE_CHAINS[record.sourceChainKey];
      const sourcePublicClient =
        record.sourceChainKey === 'baseSepolia' ? baseSepoliaClient : sepoliaClient;

      if (!isConnected || !address || !walletClient || !sourcePublicClient) {
        patch(record.id, (b) => ({ ...b, phase: 'error', error: 'Connect your wallet first' }));
        return;
      }

      const amountWei = parseUnits(record.amountUsdc, USDC_DECIMALS);
      const mintRecipientBytes32 = addressToBytes32(record.mintRecipient);

      try {
        if (chainId !== source.chainId) {
          await switchChainAsync({ chainId: source.chainId });
        }

        const balance = (await sourcePublicClient.readContract({
          address: source.usdc,
          abi: usdcAbi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (balance < amountWei) {
          throw new Error(`Not enough USDC on ${source.name}`);
        }

        const allowance = (await sourcePublicClient.readContract({
          address: source.usdc,
          abi: usdcAbi,
          functionName: 'allowance',
          args: [address, source.tokenMessenger],
        })) as bigint;

        if (allowance < amountWei) {
          patch(record.id, (b) => ({ ...b, phase: 'approving' }));
          const approveHash = await walletClient.writeContract({
            address: source.usdc,
            abi: usdcAbi,
            functionName: 'approve',
            args: [source.tokenMessenger, amountWei],
            chain: walletClient.chain,
            account: address,
          });
          await sourcePublicClient.waitForTransactionReceipt({ hash: approveHash });
          patch(record.id, (b) => ({ ...b, approveTxHash: approveHash }));
        }

        patch(record.id, (b) => ({ ...b, phase: 'burning' }));
        const burnHash = await walletClient.writeContract({
          address: source.tokenMessenger,
          abi: tokenMessengerV2Abi,
          functionName: 'depositForBurn',
          args: [
            amountWei,
            ARC_TESTNET.domain,
            mintRecipientBytes32,
            source.usdc,
            '0x0000000000000000000000000000000000000000000000000000000000000000',
            0n,
            FINALITY_THRESHOLD_FAST,
          ],
          chain: walletClient.chain,
          account: address,
        });
        await sourcePublicClient.waitForTransactionReceipt({ hash: burnHash });
        sfx.send();
        patch(record.id, (b) => ({ ...b, burnTxHash: burnHash, phase: 'relaying' }));

        await api.bridgeRelay({
          bridgeId: record.id,
          sourceDomain: source.domain,
          sourceTxHash: burnHash,
          amountUsdc: record.amountUsdc,
          mintRecipient: record.mintRecipient,
        });

        patch(record.id, (b) => ({ ...b, phase: 'attesting' }));
      } catch (err) {
        patch(record.id, (b) => ({
          ...b,
          phase: 'error',
          error: friendlyBridgeError(err, source),
        }));
      }
    },
    [address, baseSepoliaClient, chainId, isConnected, patch, sepoliaClient, switchChainAsync, walletClient],
  );

  const start = useCallback(
    async (input: StartBridgeInput) => {
      if (!isConnected || !address) return;
      const id = `${input.sourceChainKey}-${address}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: 'switching',
        sourceChainKey: input.sourceChainKey,
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.mintRecipient,
        startedAt: now,
        updatedAt: now,
      };
      // Newest first.
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));
      await runFlow(record);
    },
    [address, isConnected, runFlow],
  );

  const retry = useCallback(
    async (id: string) => {
      const cur = bridgesRef.current.find((b) => b.id === id);
      if (!cur) return;
      const now = Date.now();
      const fresh: BridgeRecord = {
        ...cur,
        phase: 'switching',
        error: undefined,
        approveTxHash: undefined,
        burnTxHash: undefined,
        mintTxHash: undefined,
        startedAt: now,
        updatedAt: now,
      };
      patch(id, () => fresh);
      await runFlow(fresh);
    },
    [patch, runFlow],
  );

  const dismiss = useCallback((id: string) => {
    setBridges((list) => list.filter((b) => b.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setBridges((list) => list.filter((b) => isActive(b.phase)));
  }, []);

  return { bridges, start, retry, dismiss, clearCompleted, isActive };
}
