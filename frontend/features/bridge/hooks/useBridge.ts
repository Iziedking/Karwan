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
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { useAuth } from '@/shared/hooks/useAuth';

const USDC_DECIMALS = 6;
const STORAGE_KEY_PREFIX = 'karwan:bridges:';
const MAX_HISTORY = 8;

function friendlyBridgeError(err: unknown, source: SourceChainConfig, phase?: BridgePhase): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const lower = raw.toLowerCase();
  const rejected =
    lower.includes('user rejected') ||
    lower.includes('user denied') ||
    lower.includes('rejected the request');
  if (rejected) {
    if (phase === 'switching') {
      return `Chain switch declined. Approve to switch to ${source.shortName}.`;
    }
    if (phase === 'approving') return 'Approve cancelled in wallet';
    if (phase === 'burning') return 'Burn cancelled in wallet';
    return 'Cancelled in wallet';
  }
  if (phase === 'switching') {
    if (lower.includes('unrecognized chain') || lower.includes('unknown chain') || lower.includes('chain id')) {
      return `Wallet does not know ${source.name}. Add the chain, then retry.`;
    }
    return `Could not switch wallet to ${source.name}. Retry to try again.`;
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
  if (lower.includes('http request failed') || lower.includes('fetch failed')) {
    return `${source.name} RPC is unreachable. Try again, or set NEXT_PUBLIC_${source.key === 'baseSepolia' ? 'BASE_SEPOLIA' : 'SEPOLIA'}_RPC to a private endpoint.`;
  }
  if (lower.includes('429') || lower.includes('too many requests') || lower.includes('rate limit')) {
    return `${source.name} RPC is rate-limited. Try again in a moment.`;
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
  const { address: wagmiAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const baseSepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.baseSepolia.chainId });
  const sepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.sepolia.chainId });
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  // Identity used for storage scoping and SSE subscription. For web3 users
  // it's the wagmi address; for Circle users it's the Circle DCW identity
  // address. Without this, Circle bridges don't persist on reload and never
  // receive attestation/mint events (SSE was previously gated on wagmi
  // isConnected, which is always false for Circle users).
  const identityAddress = (auth.address ?? wagmiAddress ?? null) as
    | `0x${string}`
    | null;
  const address = wagmiAddress;

  const [bridges, setBridges] = useState<BridgeRecord[]>([]);
  // Tracks whether we've already loaded localStorage for the current address.
  // Prevents the save effect from wiping storage with the empty initial state
  // before hydrate completes on the first render after wagmi resolves.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const bridgesRef = useRef(bridges);
  bridgesRef.current = bridges;

  // Hydrate from localStorage once the user's identity address is known.
  useEffect(() => {
    if (!identityAddress) {
      setBridges([]);
      setHydratedFor(null);
      return;
    }
    setBridges(loadFromStorage(identityAddress));
    setHydratedFor(identityAddress.toLowerCase());
  }, [identityAddress]);

  // Persist only after hydrate has completed for this address, otherwise we'd
  // overwrite saved bridges with the empty initial state on the first commit.
  useEffect(() => {
    if (!identityAddress) return;
    if (hydratedFor !== identityAddress.toLowerCase()) return;
    saveToStorage(identityAddress, bridges);
  }, [identityAddress, bridges, hydratedFor]);

  // Single SSE subscription routes bridge events to the right record by
  // bridgeId. Gated on identity (auth.address OR wagmi address), not wagmi
  // isConnected — Circle users have a Circle session but no wagmi connection,
  // and they need to see attestation+mint events the same as web3 users.
  useEffect(() => {
    if (!identityAddress) return;
    return subscribeLiveEvents((e) => {
      if (
        e.type !== 'bridge.attested' &&
        e.type !== 'bridge.minted' &&
        e.type !== 'bridge.error'
      )
        return;
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
          const txHash = e.payload?.txHash as `0x${string}` | undefined;
          // Only flip to 'done' when we have a real on-chain mint tx hash.
          // Without one we can't prove the USDC actually landed on Arc.
          if (txHash) {
            next = {
              ...cur,
              phase: 'done',
              mintTxHash: txHash,
              updatedAt: Date.now(),
            };
            if (cur.phase !== 'done') sfx.success();
          } else {
            // Stay in 'minting' so the user keeps the live indicator and the
            // "Recheck on chain" path remains active. The recheck button is
            // gated on STUCK_AFTER_MS in the UI; this is intentional.
            next = { ...cur, phase: 'minting', updatedAt: Date.now() };
          }
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
    });
  }, [identityAddress]);

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
      // Track which phase the wallet was in when an error was thrown so the
      // error message can be phase-specific (eg. a user-rejected chain switch
      // reads very differently from a user-rejected approve or burn).
      let activePhase: BridgePhase = 'switching';

      try {
        if (chainId !== source.chainId) {
          // Make sure the record is visibly in 'switching' before the wallet
          // pops. start() already initialises 'switching', but retry() patches
          // through 'switching' from any prior state — keep the visible state
          // honest before awaiting the wallet.
          patch(record.id, (b) => ({ ...b, phase: 'switching' }));
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
          activePhase = 'approving';
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

        activePhase = 'burning';
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
        activePhase = 'relaying';
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
          error: friendlyBridgeError(err, source, activePhase),
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

  /// Ask the backend to re-query Circle's attestation and try to mint. Covers
  /// bridges where the SSE update was missed (closed tab) or where the relay
  /// loop ended before IRIS finally posted the attestation.
  const recheck = useCallback(
    async (id: string) => {
      patch(id, (b) => ({ ...b, phase: 'attesting', error: undefined }));
      try {
        const r = await api.bridgeRecheck(id);
        if (r.status === 'minted') {
          // Only flip to 'done' when we have a real on-chain mint tx hash.
          // Without one we can't prove the USDC actually landed on Arc, so
          // we keep the user in 'attesting' and let them recheck again.
          // This prevents the "UI shows success but funds never arrive" bug
          // where the backend's usedNonces shortcut or a stale DB row reports
          // 'minted' without ever having relayed a real receiveMessage tx.
          const txHash = (r.mintTxHash as `0x${string}` | undefined) ?? undefined;
          if (txHash) {
            patch(id, (b) => ({ ...b, phase: 'done', mintTxHash: txHash }));
          } else {
            patch(id, (b) => ({
              ...b,
              phase: 'error',
              error:
                'Backend reports minted but has no on-chain tx hash. Verify your USDC on Arc explorer before retrying.',
            }));
          }
        } else if (r.status === 'error') {
          patch(id, (b) => ({ ...b, phase: 'error', error: r.error ?? 'Recheck failed' }));
        }
        // 'relaying' = still polling on the backend; leave the row in
        // 'attesting' so the user sees the live indicator again.
      } catch (err) {
        patch(id, (b) => ({ ...b, phase: 'error', error: (err as Error).message }));
      }
    },
    [patch],
  );

  const retry = useCallback(
    async (id: string) => {
      const cur = bridgesRef.current.find((b) => b.id === id);
      if (!cur) return;
      // If the burn already committed on the source chain, NEVER re-fire the
      // entire flow — that would double-burn the user's USDC. Divert to the
      // backend recheck which re-queries IRIS for the existing burn's
      // attestation and (re-)attempts the mint on Arc.
      if (cur.burnTxHash) {
        await recheck(id);
        return;
      }
      // Circle user retry: re-fire the backend bridge call. runFlow requires
      // a wagmi walletClient which Circle users never have, so it would
      // error out with "Connect your wallet first".
      if (isCircleUser && auth.address) {
        patch(id, (b) => ({
          ...b,
          phase: 'approving',
          error: undefined,
          approveTxHash: undefined,
          burnTxHash: undefined,
          mintTxHash: undefined,
        }));
        try {
          const r = await api.bridgeCircle({
            bridgeId: id,
            address: auth.address,
            sourceChainKey: cur.sourceChainKey,
            amountUsdc: Number(cur.amountUsdc),
            mintRecipient: cur.mintRecipient,
          });
          patch(id, (b) => ({
            ...b,
            phase: 'attesting',
            approveTxHash: r.approveTxHash as `0x${string}`,
            burnTxHash: r.burnTxHash as `0x${string}`,
          }));
        } catch (err) {
          patch(id, (b) => ({
            ...b,
            phase: 'error',
            error: (err as Error).message,
          }));
        }
        return;
      }
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
    [auth.address, isCircleUser, patch, recheck, runFlow],
  );

  const dismiss = useCallback((id: string) => {
    setBridges((list) => list.filter((b) => b.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setBridges((list) => list.filter((b) => isActive(b.phase)));
  }, []);

  /// Circle-only path. Skips the wagmi chain switch + burn signing entirely
  /// because the backend signs both from the user's source-chain Circle DCW.
  /// Frontend just records the bridge locally and patches in the burn tx hash
  /// returned by the API. The existing SSE handlers take it from there
  /// (attested → minted) so the row animates the same way as a web3 bridge.
  const startCircle = useCallback(
    async (input: StartBridgeInput & { userAddress: string }) => {
      const id = `${input.sourceChainKey}-circle-${input.userAddress}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: 'approving',
        sourceChainKey: input.sourceChainKey,
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.mintRecipient,
        startedAt: now,
        updatedAt: now,
      };
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));
      try {
        const r = await api.bridgeCircle({
          bridgeId: id,
          address: input.userAddress,
          sourceChainKey: input.sourceChainKey,
          amountUsdc: input.amountUsdc,
          mintRecipient: input.mintRecipient,
        });
        patch(id, (b) => ({
          ...b,
          phase: 'attesting',
          approveTxHash: r.approveTxHash as `0x${string}`,
          burnTxHash: r.burnTxHash as `0x${string}`,
        }));
      } catch (err) {
        patch(id, (b) => ({
          ...b,
          phase: 'error',
          error: (err as Error).message,
        }));
      }
    },
    [patch],
  );

  return { bridges, start, startCircle, retry, recheck, dismiss, clearCompleted, isActive };
}
