'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { parseUnits } from 'viem';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from 'wagmi';
import { api, ApiError, type ChainEvent } from '@/core/api';
import {
  ARC_TESTNET,
  SOURCE_CHAINS,
  APP_KIT_SOURCES,
  APPKIT_CHAIN,
  APPKIT_ARC_CHAIN,
  isAppKitOnlyChainKey,
  addressToBytes32,
  FINALITY_THRESHOLD_FAST,
  type SourceChainConfig,
  type CctpChainKey,
  type AnySourceChainKey,
} from '../config';
import { tokenMessengerV2Abi, usdcAbi } from '../abis';
import { sfx } from '@/shared/utils/sfx';
import { subscribeLiveEvents } from '@/shared/utils/liveEventBus';
import { useAuth } from '@/shared/hooks/useAuth';
import { useGuide } from '@/shared/guide/GuideProvider';

const USDC_DECIMALS = 6;
const STORAGE_KEY_PREFIX = 'karwan:bridges:';
const MAX_HISTORY = 8;

/// Pulls a usable string out of anything that might be thrown or passed as an
/// error payload (Error instances, viem ContractFunctionError objects, raw
/// `{ message, ... }` shapes, plain strings). The previous version used
/// `String(err)` which renders objects as `[object Object]` and hides the
/// underlying cause.
function errorToString(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Error';
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const candidates = [
      o.shortMessage,
      o.message,
      o.error,
      o.reason,
      o.detail,
      o.details,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c;
    }
    try {
      return JSON.stringify(o);
    } catch {
      return '[unserialisable error]';
    }
  }
  return String(err);
}

function friendlyBridgeError(err: unknown, source: SourceChainConfig, phase?: BridgePhase): string {
  const raw = errorToString(err);
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
  // Generic fallback. We log the raw error to the console for debugging,
  // but the UI string stays clean so users don't see stack traces or
  // viem internals. Tighten the friendly mapping above when you spot a
  // new common error to handle.
  if (typeof console !== 'undefined' && err) {
    // eslint-disable-next-line no-console
    console.warn('[bridge]', err);
  }
  // Switching phase already returned earlier in the function with a more
  // specific message. Cover the remaining mid-flow phases here.
  if (phase === 'approving') return 'Approval did not go through. Retry to try again.';
  if (phase === 'burning') return 'Burn did not go through. Retry to try again.';
  return 'Bridge failed. Retry from start, or recheck on chain if your burn already landed.';
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
  /// 'in' = chain -> Arc (mint on Arc). 'out' = Arc -> chain (mint on the other
  /// chain). Absent is treated as 'in' (legacy + the existing web3/circle flow).
  direction?: 'in' | 'out';
  /// For 'in' the source chain; for 'out' the destination chain. Either way the
  /// non-Arc chain. EVM chains resolve via SOURCE_CHAINS; Solana Devnet (App-
  /// Kit-only) resolves via APP_KIT_SOURCES; use bridgeChainMeta(key) to look
  /// up name/short-name/explorer uniformly so consumers don't have to branch.
  sourceChainKey: AnySourceChainKey;
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

/// Uniform metadata lookup for any source chain (EVM or App-Kit-only). Use
/// from row rendering and SSE handlers so we never have to branch on Solana
/// vs EVM at the call site.
export function bridgeChainMeta(key: AnySourceChainKey): {
  name: string;
  shortName: string;
  nativeSymbol: string;
  explorerTx: (h: string) => string;
} {
  // Instant Arc-to-Arc sends (cash out to an Arc wallet) carry the synthetic
  // 'arc' key so they share the bridge store, activity list, and history modal
  // with real bridges. They never enter the CCTP flow.
  if ((key as string) === 'arc') {
    return {
      name: 'Arc',
      shortName: 'Arc',
      nativeSymbol: 'USDC',
      explorerTx: (h: string) => ARC_TESTNET.explorerTx(h),
    };
  }
  if (isAppKitOnlyChainKey(key)) {
    const c = APP_KIT_SOURCES[key];
    return {
      name: c.name,
      shortName: c.shortName,
      nativeSymbol: c.nativeSymbol,
      explorerTx: c.explorerTx,
    };
  }
  const c = SOURCE_CHAINS[key];
  return {
    name: c.name,
    shortName: c.shortName,
    nativeSymbol: c.nativeSymbol,
    explorerTx: c.explorerTx,
  };
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

/// Circle bridges carry "-circle-" in their id (see startCircle). Their source
/// approve+burn run on the backend pipeline, so unlike web3 bridges they keep
/// progressing across a page reload and resume via the backend rather than a
/// browser re-sign.
function isCircleBridgeId(id: string): boolean {
  return id.includes('-circle-');
}

function storageKey(address?: `0x${string}` | null): string | null {
  if (!address) return null;
  return `${STORAGE_KEY_PREFIX}${address.toLowerCase()}`;
}

const PRUNE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function loadFromStorage(address: `0x${string}` | null | undefined): BridgeRecord[] {
  const key = storageKey(address);
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw) as BridgeRecord[];
    const cutoff = Date.now() - PRUNE_AFTER_MS;
    // Wallet-local async state is lost on reload. Anything mid-sign becomes
    // 'error' so the user can retry cleanly. Attesting/minting bridges
    // continue via SSE. Records older than the prune window are dropped
    // entirely: the backend is the source of truth for active bridges, this
    // is just a per-device render cache.
    return arr
      .filter((b) => (b.updatedAt ?? b.startedAt ?? 0) > cutoff)
      .map((b) => {
        // Circle bridges run approve+burn on the backend, so they keep
        // progressing after a reload. Leave them in place; the auto-resume
        // effect re-syncs them with the backend and SSE animates the rest.
        if (isCircleBridgeId(b.id)) return b;
        if (
          b.phase === 'switching' ||
          b.phase === 'approving' ||
          b.phase === 'burning' ||
          b.phase === 'relaying'
        ) {
          return {
            ...b,
            phase: 'error' as const,
            error: b.error ?? 'Interrupted on reload. Retry to resume.',
          };
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

/// Module-level shared bridges store. Every useBridges() consumer subscribes
/// to the same per-address slice via useSyncExternalStore so the TopNav
/// badge, the History modal, and the active bridge card all see the same
/// list, no more "TopNav says 4 in flight but the modal shows 0" because
/// each component had its own useState going through hydrate at a
/// different time. Keyed by lowercased identity address so a Circle user
/// and a web3 user share the same shape but get isolated lists.
const sharedBridgesByAddress = new Map<string, BridgeRecord[]>();
const sharedBridgesSubscribers = new Set<() => void>();

function readSharedBridges(addressLower: string | null): BridgeRecord[] {
  if (!addressLower) return EMPTY_BRIDGES;
  return sharedBridgesByAddress.get(addressLower) ?? EMPTY_BRIDGES;
}

/// Frozen empty array reused across reads so React's identity-based
/// re-render check doesn't fire a render storm when there are no bridges
/// (each call would otherwise return a new [] reference).
const EMPTY_BRIDGES: BridgeRecord[] = Object.freeze([]) as unknown as BridgeRecord[];

function writeSharedBridges(
  addressLower: string | null,
  updater: BridgeRecord[] | ((prev: BridgeRecord[]) => BridgeRecord[]),
): void {
  if (!addressLower) return;
  const prev = sharedBridgesByAddress.get(addressLower) ?? EMPTY_BRIDGES;
  const next = typeof updater === 'function'
    ? (updater as (p: BridgeRecord[]) => BridgeRecord[])(prev)
    : updater;
  if (next === prev) return;
  sharedBridgesByAddress.set(addressLower, next);
  for (const cb of sharedBridgesSubscribers) cb();
}

function subscribeSharedBridges(cb: () => void): () => void {
  sharedBridgesSubscribers.add(cb);
  return () => {
    sharedBridgesSubscribers.delete(cb);
  };
}

/// Map backend `BridgeStatus` to the frontend `BridgePhase`. The backend
/// has a coarser status enum (5 values) than the UI's phase enum (8),
/// the missing values are transient client-only states ('switching',
/// 'attesting', 'minting') that the backend either skips or names
/// differently. The choices below pick the right "this is what the user
/// should see for a record we restored from cold storage" phase.
function phaseFromBackendStatus(
  status: 'approving' | 'burning' | 'relaying' | 'minted' | 'error',
): BridgePhase {
  if (status === 'minted') return 'done';
  if (status === 'relaying') return 'attesting';
  return status;
}

type RemoteBridge = Awaited<ReturnType<typeof api.bridgeList>>['bridges'][number];

/// Merge backend-persisted bridges into the current in-memory list. Records
/// the local cache already has stay as-is (they're typically newer and
/// carry transient client-only state the backend wouldn't know about);
/// records only on the backend are converted to BridgeRecord shape and
/// appended. The result is sorted by startedAt desc so the history reads
/// newest-first across both sources.
function mergeRemoteBridges(local: BridgeRecord[], remote: RemoteBridge[]): BridgeRecord[] {
  const known = new Set(local.map((b) => b.id));
  const restored: BridgeRecord[] = [];
  for (const r of remote) {
    if (known.has(r.bridgeId)) continue;
    if (!r.sourceChainKey) continue; // missing chain context, unrenderable
    /// The mintRecipient is the eventual mint destination. For 'in'
    /// bridges that's the user's Arc wallet (the row needs it to render
    /// the MINTS TO band). If the backend doesn't have it (older records
    /// pre-mintRecipient persist), skip rather than render a half-row.
    if (!r.mintRecipient) continue;
    restored.push({
      id: r.bridgeId,
      phase: phaseFromBackendStatus(r.status),
      direction: r.direction,
      sourceChainKey: r.sourceChainKey as BridgeRecord['sourceChainKey'],
      amountUsdc: r.amountUsdc,
      mintRecipient: r.mintRecipient as `0x${string}`,
      approveTxHash: (r.sourceTxHash ?? undefined) as `0x${string}` | undefined,
      burnTxHash: (r.sourceTxHash ?? undefined) as `0x${string}` | undefined,
      mintTxHash: (r.mintTxHash ?? undefined) as `0x${string}` | undefined,
      error: r.error ?? undefined,
      startedAt: r.createdAt,
      updatedAt: r.updatedAt,
    });
  }
  if (restored.length === 0) return local;
  return [...local, ...restored].sort((a, b) => b.startedAt - a.startedAt);
}

export function useBridges() {
  const { address: wagmiAddress, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  // Public client per CCTP source chain so any registered chain's web3 burn
  // reads from the right RPC (not a base/eth fallback). Memoised so the keyed
  // map is stable for callback deps.
  const sepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.sepolia.chainId });
  const optimismSepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.optimismSepolia.chainId });
  const arbitrumSepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.arbitrumSepolia.chainId });
  const baseSepoliaClient = usePublicClient({ chainId: SOURCE_CHAINS.baseSepolia.chainId });
  const polygonAmoyClient = usePublicClient({ chainId: SOURCE_CHAINS.polygonAmoy.chainId });
  // Arc reads for the web3 bridge-out path (balance, allowance, burn receipt).
  const arcClient = usePublicClient({ chainId: ARC_TESTNET.chainId });
  const sourceClients = useMemo<Record<CctpChainKey, ReturnType<typeof usePublicClient>>>(
    () => ({
      sepolia: sepoliaClient,
      optimismSepolia: optimismSepoliaClient,
      arbitrumSepolia: arbitrumSepoliaClient,
      baseSepolia: baseSepoliaClient,
      polygonAmoy: polygonAmoyClient,
    }),
    [sepoliaClient, optimismSepoliaClient, arbitrumSepoliaClient, baseSepoliaClient, polygonAmoyClient],
  );
  const auth = useAuth();
  const isCircleUser = auth.method === 'circle';
  const { recordAction } = useGuide();
  // Identity used for storage scoping and SSE subscription. For web3 users
  // it's the wagmi address; for Circle users it's the Circle DCW identity
  // address. Without this, Circle bridges don't persist on reload and never
  // receive attestation/mint events (SSE was previously gated on wagmi
  // isConnected, which is always false for Circle users).
  const identityAddress = (auth.address ?? wagmiAddress ?? null) as
    | `0x${string}`
    | null;
  const address = wagmiAddress;

  /// Subscribe to the shared per-address bridges slice. Every useBridges()
  /// consumer reads the same store so two components rendering in parallel
  /// can never disagree on what's pending vs done.
  const addressLower = identityAddress?.toLowerCase() ?? null;
  const getSnapshot = useCallback(
    () => readSharedBridges(addressLower),
    [addressLower],
  );
  const bridges = useSyncExternalStore(
    subscribeSharedBridges,
    getSnapshot,
    /// SSR snapshot is always empty, bridges are client-only state.
    () => EMPTY_BRIDGES,
  );
  const setBridges = useCallback(
    (updater: BridgeRecord[] | ((prev: BridgeRecord[]) => BridgeRecord[])) => {
      writeSharedBridges(addressLower, updater);
    },
    [addressLower],
  );
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

  /// After localStorage hydrate, pull the backend's bridge history (every
  /// Circle bridge ever started against this identity) and merge any
  /// records local storage doesn't already have. Closes the "history
  /// disappeared" gap users hit on cache clear / device switch / when the
  /// 50-row MAX_HISTORY truncation discarded an old bridge. Web3-path
  /// bridges never appear server-side, so this is a no-op for them.
  useEffect(() => {
    if (!identityAddress) return;
    if (hydratedFor !== identityAddress.toLowerCase()) return;
    let cancelled = false;
    (async () => {
      try {
        const { bridges: remote } = await api.bridgeList(identityAddress);
        if (cancelled || remote.length === 0) return;
        setBridges((current) => mergeRemoteBridges(current, remote));
      } catch {
        /* network or auth blip; localStorage stays primary */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identityAddress, hydratedFor]);

  // Auto-recheck any in-flight bridge once per hydrate. SSE has no replay
  // buffer, so if the backend's `bridge.attested` / `bridge.minted` event
  // fired while the page was closed (e.g. user navigated away between burn
  // and attestation), the bridge sits forever in attesting/minting from
  // localStorage and the user has to click retry. This fixes that by
  // resyncing each in-flight bridge against the backend on mount.
  const autoRecheckedFor = useRef<string | null>(null);

  // Persist only after hydrate has completed for this address, otherwise we'd
  // overwrite saved bridges with the empty initial state on the first commit.
  useEffect(() => {
    if (!identityAddress) return;
    if (hydratedFor !== identityAddress.toLowerCase()) return;
    saveToStorage(identityAddress, bridges);
  }, [identityAddress, bridges, hydratedFor]);

  // Single SSE subscription routes bridge events to the right record by
  // bridgeId. Gated on identity (auth.address OR wagmi address), not wagmi
  // isConnected. Circle users have a Circle session but no wagmi connection,
  // and they need to see attestation+mint events the same as web3 users.
  useEffect(() => {
    if (!identityAddress) return;
    return subscribeLiveEvents((e) => {
      if (
        e.type !== 'bridge.approving' &&
        e.type !== 'bridge.burning' &&
        e.type !== 'bridge.burned' &&
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
        if (e.type === 'bridge.approving') {
          // Source pipeline (Circle path) signing the approve on the user's DCW.
          next = { ...cur, phase: 'approving', error: undefined, updatedAt: Date.now() };
        } else if (e.type === 'bridge.burning') {
          next = { ...cur, phase: 'burning', error: undefined, updatedAt: Date.now() };
        } else if (e.type === 'bridge.burned') {
          // Burn landed on the source chain. Record the hash and move into the
          // attestation wait. burnTxHash also gates retry -> recheck so a burned
          // bridge is never re-burned.
          const srcHash = e.payload?.sourceTxHash as `0x${string}` | undefined;
          next = {
            ...cur,
            phase: 'attesting',
            burnTxHash: srcHash ?? cur.burnTxHash,
            error: undefined,
            updatedAt: Date.now(),
          };
        } else if (e.type === 'bridge.attested') {
          // Progressing again: clear any stale error from a prior failed
          // recheck so the row doesn't show "attesting" alongside an old error.
          next = { ...cur, phase: 'minting', error: undefined, updatedAt: Date.now() };
        } else if (e.type === 'bridge.minted') {
          const txHash = e.payload?.txHash as `0x${string}` | undefined;
          // Only flip to 'done' when we have a real on-chain mint tx hash.
          // Without one we can't prove the USDC actually landed on Arc.
          if (txHash) {
            next = {
              ...cur,
              phase: 'done',
              mintTxHash: txHash,
              // The mint landed; drop any leftover error from an earlier
              // recheck attempt so we don't show BRIDGED + a stale error banner.
              error: undefined,
              updatedAt: Date.now(),
            };
            if (cur.phase !== 'done') {
              sfx.success();
              recordAction('bridge');
            }
          } else {
            // Stay in 'minting' so the user keeps the live indicator and the
            // "Recheck on chain" path remains active. The recheck button is
            // gated on STUCK_AFTER_MS in the UI; this is intentional.
            next = { ...cur, phase: 'minting', updatedAt: Date.now() };
          }
        } else if (e.type === 'bridge.error') {
          // Backend log already has the raw error. Surface a clean line on
          // the UI; the user clicks recheck or retry from there.
          const raw = errorToString(e.payload?.message);
          if (typeof console !== 'undefined' && raw) {
            // eslint-disable-next-line no-console
            console.warn('[bridge.error]', raw);
          }
          next = {
            ...cur,
            phase: 'error',
            error: 'Mint did not land on Arc. Recheck on chain to retry.',
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
  }, [identityAddress, recordAction]);

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
      // runFlow is the legacy web3 wagmi-signed CCTP path, kept as a fallback
      // now that the default bridge-in goes through startAppKitBridge. App-Kit
      // sources never enter this; the guards below keep a stray caller from
      // dropping a non-EVM record into the EVM signer path.
      if ((record.sourceChainKey as string) === 'arc') {
        // Instant Arc sends never enter the CCTP signer path. Guard so a stray
        // retry can't dereference SOURCE_CHAINS['arc'] (undefined).
        patch(record.id, (b) => ({
          ...b,
          phase: 'error',
          error: 'This is an instant Arc send. Start a new one to retry.',
        }));
        return;
      }
      if (isAppKitOnlyChainKey(record.sourceChainKey)) {
        patch(record.id, (b) => ({
          ...b,
          phase: 'error',
          error: 'This source is signed by Circle on the backend. Use the App Kit bridge.',
        }));
        return;
      }
      const cctpKey: CctpChainKey = record.sourceChainKey;
      const source = SOURCE_CHAINS[cctpKey];
      const sourcePublicClient = sourceClients[cctpKey];

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
          // through 'switching' from any prior state, keep the visible state
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
    [address, sourceClients, chainId, isConnected, patch, switchChainAsync, walletClient],
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
          // Recheck only returns 'minted' after on-chain confirmation: either it
          // just relayed receiveMessage (we get a hash) or isMessageAlreadyReceived
          // proved the CCTP nonce was already consumed on Arc — i.e. the USDC
          // landed, there just isn't a locally-originated tx hash to show. Both
          // mean the funds are on Arc, so settle to 'done'. A missing hash only
          // costs the explorer deep-link; it is not a failure. (Earlier this
          // path showed a scary FAILED for a withdraw that had actually worked.)
          const txHash = (r.mintTxHash as `0x${string}` | undefined) ?? undefined;
          patch(id, (b) => ({ ...b, phase: 'done', mintTxHash: txHash, error: undefined }));
        } else if (r.status === 'error') {
          if (typeof console !== 'undefined' && r.error) {
            // eslint-disable-next-line no-console
            console.warn('[bridge.recheck]', r.error);
          }
          patch(id, (b) => ({
            ...b,
            phase: 'error',
            error: 'Recheck did not complete. Try again in a moment.',
          }));
        }
        // 'relaying' = still polling on the backend; leave the row in
        // 'attesting' so the user sees the live indicator again.
      } catch (err) {
        const real = errorToString(err);
        const raw = real.toLowerCase();
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[bridge.recheck]', real);
        }
        // 409 "a relay is already in progress" is not a failure. The backend's
        // recheck endpoint refuses to start a parallel relay while one is
        // already running; the existing relay continues and SSE will animate
        // the row when the attestation lands. Keep the row in 'attesting',
        // clear the spurious error, and let the user wait (or recheck again
        // later once the in-flight relay finishes). Without this branch the
        // row gets stamped 'error' even though nothing actually broke.
        if (
          err instanceof ApiError &&
          err.status === 409 &&
          (raw.includes('relay is already in progress') || raw.includes('relaying'))
        ) {
          patch(id, (b) => ({ ...b, phase: 'attesting', error: undefined }));
          return;
        }
        // Treat "bridge not found" specially. This happens when the backend
        // record was wiped (flat-file reset, DB migration, fresh deploy) but
        // the frontend still has the bridgeId in localStorage. Retrying the
        // recheck endlessly will never succeed; the user needs to dismiss
        // the orphaned row and start a fresh bridge.
        const isOrphan =
          raw.includes('not found') ||
          raw.includes('bridge not found') ||
          raw.includes('404');
        // Otherwise surface the backend's real reason (IRIS lookup, Arc mint
        // relay revert) instead of a dead-end generic line, so a stuck bridge
        // is diagnosable. The burn already landed, so recheck stays available.
        const reason = real.trim();
        const surfaced =
          reason && !/^\d+$/.test(reason)
            ? `Recheck failed. ${reason.slice(0, 140)}`
            : 'Recheck failed. Try again in a moment.';
        patch(id, (b) => ({
          ...b,
          phase: 'error',
          error: isOrphan ? 'Bridge record not found. Dismiss and start a fresh one.' : surfaced,
        }));
      }
    },
    [patch],
  );

  // One-shot auto-recheck on hydrate: any bridge persisted as in-flight gets
  // a single backend recheck so missed SSE events (page closed between burn
  // and attestation) don't leave the row stuck on "attesting" forever.
  useEffect(() => {
    if (!identityAddress) return;
    const key = identityAddress.toLowerCase();
    if (hydratedFor !== key) return;
    if (autoRecheckedFor.current === key) return;
    autoRecheckedFor.current = key;
    const inFlightList = bridgesRef.current.filter((b) =>
      isCircleBridgeId(b.id)
        ? b.phase === 'approving' ||
          b.phase === 'burning' ||
          b.phase === 'relaying' ||
          b.phase === 'attesting' ||
          b.phase === 'minting'
        : b.phase === 'attesting' || b.phase === 'minting' || b.phase === 'relaying',
    );
    inFlightList.forEach((b) => {
      // Circle bridges resume the backend source pipeline (which may still be
      // mid approve/burn); web3 bridges re-query IRIS via recheck. Either way a
      // missed SSE update (closed tab) gets re-synced on mount.
      const p = isCircleBridgeId(b.id) ? api.bridgeCircleResume(b.id) : recheck(b.id);
      Promise.resolve(p).catch(() => {
        /* logs server-side; UI keeps the previous state */
      });
    });
  }, [identityAddress, hydratedFor, recheck]);

  const retry = useCallback(
    async (id: string) => {
      const cur = bridgesRef.current.find((b) => b.id === id);
      if (!cur) return;
      // Instant Arc sends are terminal. There is nothing to re-drive, and
      // re-sending could double-spend, so retry is a no-op: dismiss and start
      // a fresh one instead.
      if ((cur.sourceChainKey as string) === 'arc') return;
      // If the burn already committed on the source chain, NEVER re-fire the
      // entire flow, that would double-burn the user's USDC. Divert to the
      // backend recheck which re-queries IRIS for the existing burn's
      // attestation and (re-)attempts the mint on Arc.
      if (cur.burnTxHash) {
        await recheck(id);
        return;
      }
      // Circle user retry: resume the backend source pipeline rather than
      // re-POSTing circle-bridge (which would 409 on the existing bridge id).
      // The pipeline reads the live allowance, so a half-done attempt picks up
      // where it left off. runFlow can't help here (Circle users have no wagmi
      // walletClient). SSE animates the row from the resumed pipeline.
      if (isCircleUser && auth.address) {
        patch(id, (b) => ({ ...b, phase: 'approving', error: undefined }));
        try {
          await api.bridgeCircleResume(id);
        } catch (err) {
          const raw = errorToString(err).toLowerCase();
          if (typeof console !== 'undefined') {
            // eslint-disable-next-line no-console
            console.warn('[bridge.retry.circle]', errorToString(err));
          }
          const isOrphan = raw.includes('not found') || raw.includes('404');
          patch(id, (b) => ({
            ...b,
            phase: 'error',
            error: isOrphan
              ? 'Bridge record not found. Dismiss and start a fresh one.'
              : 'Retry failed. Check your source-chain funding and try again.',
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

  /// Bulk dismiss for the "Dismiss all" button in BridgeHistoryPanel. Pass
  /// the filtered list's ids so the call respects whatever chip the user
  /// has active (ALL clears everything, FAILED clears only failed, etc.).
  const dismissMany = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    setBridges((list) => list.filter((b) => !idSet.has(b.id)));
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
        await api.bridgeCircle({
          bridgeId: id,
          address: input.userAddress,
          sourceChainKey: input.sourceChainKey,
          amountUsdc: input.amountUsdc,
          mintRecipient: input.mintRecipient,
        });
        // Async backend: the bridge is queued in the source pipeline. SSE drives
        // the row from here (approving -> burning -> burned -> attested ->
        // minted). Keep it visibly in 'approving' until the first event lands.
        patch(id, (b) => ({ ...b, phase: 'approving', error: undefined }));
      } catch (err) {
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[bridge.startCircle]', errorToString(err));
        }
        const raw = errorToString(err).toLowerCase();
        const friendly = raw.includes('failed to fetch')
          ? 'Could not reach the bridge service. Check your connection and try again.'
          : raw.includes('insufficient')
            ? 'Source-chain wallet is short on funds. Top it up and try again.'
            : 'Bridge could not start. Try again in a moment.';
        patch(id, (b) => ({
          ...b,
          phase: 'error',
          error: friendly,
        }));
      }
    },
    [patch],
  );

  /// Circle bridge-OUT (Arc -> chain). Backend burns from the identity DCW on
  /// Arc and relays the mint on the destination chain (gas sponsored via Gas
  /// Station). Records the bridge locally; the same SSE handlers animate it
  /// (burning -> attesting -> minting -> done) by bridgeId.
  const startCircleOut = useCallback(
    async (input: {
      destChainKey: SourceChainConfig['key'];
      amountUsdc: number;
      recipient: `0x${string}`;
      userAddress: string;
    }) => {
      const id = `${input.destChainKey}-out-${input.userAddress}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: 'burning',
        direction: 'out',
        sourceChainKey: input.destChainKey, // the non-Arc chain = destination
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.recipient,
        startedAt: now,
        updatedAt: now,
      };
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));
      try {
        await api.bridgeOut({
          bridgeId: id,
          address: input.userAddress,
          destChainKey: input.destChainKey,
          amountUsdc: input.amountUsdc,
          recipient: input.recipient,
        });
        patch(id, (b) => ({ ...b, phase: 'burning', error: undefined }));
      } catch (err) {
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[bridge.startCircleOut]', errorToString(err));
        }
        const raw = errorToString(err).toLowerCase();
        const friendly = raw.includes('insufficient')
          ? 'Your Arc balance is short. Lower the amount and try again.'
          : raw.includes('failed to fetch')
            ? 'Could not reach the bridge service. Try again in a moment.'
            : 'Bridge-out could not start. Try again in a moment.';
        patch(id, (b) => ({ ...b, phase: 'error', error: friendly }));
      }
    },
    [patch],
  );

  /// Bridge IN via App Kit + Circle's Forwarding Service, for ANY source chain
  /// (EVM or Solana). The user signs the source-chain burn in their own wallet
  /// (viem adapter for EVM, Solana adapter for Solana); the forwarder fetches
  /// the attestation and submits the Arc mint, so there is no destination
  /// signer and no backend relay. Works for both Circle and web3 accounts
  /// because the mint recipient is just an Arc address. App Kit is imported
  /// dynamically so the SDK stays out of the main bundle until a bridge runs.
  const startAppKitBridge = useCallback(
    async (input: {
      sourceChainKey: AnySourceChainKey;
      amountUsdc: number;
      mintRecipient: `0x${string}`;
      /// EVM only: returns the connected wallet's EIP-1193 provider for the
      /// viem adapter. Solana reads window.solana directly.
      getEvmProvider?: () => Promise<unknown>;
    }) => {
      const isSolana = isAppKitOnlyChainKey(input.sourceChainKey);
      const id = `${input.sourceChainKey}-appkit-${input.mintRecipient}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: isSolana ? 'burning' : 'approving',
        direction: 'in',
        sourceChainKey: input.sourceChainKey,
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.mintRecipient,
        startedAt: now,
        updatedAt: now,
      };
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));
      try {
        const { AppKit } = await import('@circle-fin/app-kit');
        let adapter: unknown;
        if (isSolana) {
          const provider = (window as unknown as { solana?: unknown }).solana;
          if (!provider) throw new Error('Connect your Solana wallet first');
          const { createSolanaKitAdapterFromProvider } = await import('@circle-fin/adapter-solana-kit');
          adapter = await createSolanaKitAdapterFromProvider({ provider: provider as never });
        } else {
          const provider = input.getEvmProvider ? await input.getEvmProvider() : undefined;
          if (!provider) throw new Error('Connect your wallet first');
          const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2');
          adapter = await createViemAdapterFromProvider({ provider: provider as never });
        }
        const kit = new AppKit();
        // Map the SDK's lifecycle events onto our phases. Names/shape are loose
        // across versions, so read defensively.
        // Each step carries a txHash + explorerUrl (approve / burn /
        // fetchAttestation / mint). Capture them onto the record as they land
        // so the history row shows the source burn and the Arc mint with
        // explorer links, the same way ArcRun surfaces them.
        kit.on('*', (payload: unknown) => {
          const p = payload as {
            values?: { name?: string; state?: string; txHash?: string };
          };
          const name = p.values?.name;
          const state = p.values?.state;
          const txHash = p.values?.txHash as `0x${string}` | undefined;
          if (typeof console !== 'undefined') {
            // eslint-disable-next-line no-console
            console.debug('[bridge.appkit]', input.sourceChainKey, name, state, txHash);
          }
          if (name === 'approve') {
            patch(id, (b) => ({ ...b, phase: state === 'success' ? 'burning' : 'approving', updatedAt: Date.now() }));
          } else if (name === 'burn') {
            patch(id, (b) => ({
              ...b,
              phase: state === 'success' ? 'attesting' : 'burning',
              burnTxHash: txHash ?? b.burnTxHash,
              updatedAt: Date.now(),
            }));
          } else if (name === 'fetchAttestation') {
            patch(id, (b) => ({ ...b, phase: 'attesting', updatedAt: Date.now() }));
          } else if (name === 'mint') {
            // The forwarder reports the mint as 'forwarded' (it submits the tx),
            // so treat that as done too.
            patch(id, (b) => ({
              ...b,
              phase: state === 'success' || state === 'forwarded' ? 'done' : 'minting',
              mintTxHash: txHash ?? b.mintTxHash,
              updatedAt: Date.now(),
            }));
          }
        });
        const result = (await kit.bridge({
          from: { adapter, chain: APPKIT_CHAIN[input.sourceChainKey] },
          to: { recipientAddress: input.mintRecipient, chain: APPKIT_ARC_CHAIN, useForwarder: true },
          amount: input.amountUsdc.toString(),
        } as never)) as {
          state?: string;
          steps?: Array<{ name?: string; state?: string; txHash?: string }>;
        };
        const burnHash = result?.steps?.find((s) => s.name === 'burn')?.txHash as
          | `0x${string}`
          | undefined;
        const mintHash = result?.steps?.find((s) => s.name === 'mint')?.txHash as
          | `0x${string}`
          | undefined;
        if (result?.state === 'error') {
          patch(id, (b) => ({
            ...b,
            phase: 'error',
            error: 'Transfer failed. Try again.',
            burnTxHash: burnHash ?? b.burnTxHash,
          }));
          return;
        }
        // Settle to done with whatever hashes the result carried. In forwarder
        // mode the mint hash may be absent (the forwarder submitted it); the
        // burn hash still gives a source-chain explorer link.
        patch(id, (b) => ({
          ...b,
          phase: 'done',
          burnTxHash: burnHash ?? b.burnTxHash,
          mintTxHash: mintHash ?? b.mintTxHash,
          error: undefined,
        }));
        // Record it server-side so it shows in the main /activity feed and
        // survives a device/localStorage clear. Best-effort: the on-chain funds
        // and the local record are unaffected if this fails.
        api
          .bridgeRecord({
            bridgeId: id,
            sourceChainKey: input.sourceChainKey,
            amountUsdc: input.amountUsdc,
            mintRecipient: input.mintRecipient,
            ...(burnHash ? { burnTxHash: burnHash } : {}),
            ...(mintHash ? { mintTxHash: mintHash } : {}),
          })
          .catch(() => {
            /* history/activity is best-effort; ignore */
          });
        sfx.success();
        recordAction('bridge');
      } catch (err) {
        // Log the full error so a failed Solana/EVM bridge (which can't be
        // tested here without a wallet) is diagnosable from the console.
        if (typeof console !== 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('[bridge.appkit] failed', errorToString(err), err);
        }
        const raw = errorToString(err).toLowerCase();
        const friendly =
          raw.includes('rejected') || raw.includes('denied') || raw.includes('user cancelled')
            ? 'Cancelled in your wallet'
            : raw.includes('insufficient') || raw.includes('not enough')
              ? 'Not enough USDC for this transfer.'
              : `Transfer could not complete. ${errorToString(err).slice(0, 140)}`;
        patch(id, (b) => ({ ...b, phase: 'error', error: friendly }));
      }
    },
    [patch, recordAction],
  );

  /// Instant Arc-to-Arc send (cash out to an Arc wallet). One backend transfer,
  /// no CCTP, settles synchronously. Stored as an 'out' record with the
  /// synthetic 'arc' key so it shows up in the activity list and history modal
  /// alongside real bridges.
  const startArcSend = useCallback(
    async (input: { amountUsdc: number; recipient: `0x${string}`; userAddress: string }) => {
      const id = `arc-send-${input.userAddress}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: 'burning',
        direction: 'out',
        sourceChainKey: 'arc' as AnySourceChainKey,
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.recipient,
        startedAt: now,
        updatedAt: now,
      };
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));
      try {
        const r = await api.cashoutArcSend({
          recipient: input.recipient,
          amountUsdc: input.amountUsdc,
        });
        patch(id, (b) => ({
          ...b,
          phase: 'done',
          mintTxHash: (r.txHash ?? undefined) as `0x${string}` | undefined,
          error: undefined,
        }));
        sfx.success();
      } catch (err) {
        const detail =
          err instanceof ApiError && typeof err.detail === 'string'
            ? err.detail
            : errorToString(err);
        patch(id, (b) => ({ ...b, phase: 'error', error: detail }));
      }
    },
    [patch],
  );

  /// Web3 bridge-out: the user's own wallet signs the Arc burn, then the backend
  /// relays the destination mint. Mirrors the inbound runFlow (approve +
  /// depositForBurn + receipt) but Arc -> destination, using the backend quote so
  /// the burn carries the right domain, padded recipient, and Fast maxFee.
  const startWeb3Out = useCallback(
    async (input: {
      destChainKey: CctpChainKey;
      amountUsdc: number;
      recipient: `0x${string}`;
      userAddress: string;
    }) => {
      if (!isConnected || !address || !walletClient || !arcClient) return;
      const id = `${input.destChainKey}-out-${input.userAddress}-${Date.now()}`;
      const now = Date.now();
      const record: BridgeRecord = {
        id,
        phase: 'switching',
        direction: 'out',
        sourceChainKey: input.destChainKey, // the non-Arc chain = destination
        amountUsdc: input.amountUsdc.toString(),
        mintRecipient: input.recipient,
        startedAt: now,
        updatedAt: now,
      };
      setBridges((list) => [record, ...list].slice(0, MAX_HISTORY));

      let activePhase: BridgePhase = 'switching';
      try {
        if (chainId !== ARC_TESTNET.chainId) {
          await switchChainAsync({ chainId: ARC_TESTNET.chainId });
        }
        const quote = await api.web3BridgeOutQuote({
          destChainKey: input.destChainKey,
          amountUsdc: input.amountUsdc,
          recipient: input.recipient,
        });
        const amountWei = BigInt(quote.amountWei);

        const balance = (await arcClient.readContract({
          address: quote.usdc,
          abi: usdcAbi,
          functionName: 'balanceOf',
          args: [address],
        })) as bigint;
        if (balance < amountWei) throw new Error('Not enough USDC on Arc');

        const allowance = (await arcClient.readContract({
          address: quote.usdc,
          abi: usdcAbi,
          functionName: 'allowance',
          args: [address, quote.tokenMessenger],
        })) as bigint;
        if (allowance < amountWei) {
          activePhase = 'approving';
          patch(id, (b) => ({ ...b, phase: 'approving' }));
          const approveHash = await walletClient.writeContract({
            address: quote.usdc,
            abi: usdcAbi,
            functionName: 'approve',
            args: [quote.tokenMessenger, amountWei],
            chain: walletClient.chain,
            account: address,
          });
          await arcClient.waitForTransactionReceipt({ hash: approveHash });
          patch(id, (b) => ({ ...b, approveTxHash: approveHash }));
        }

        activePhase = 'burning';
        patch(id, (b) => ({ ...b, phase: 'burning' }));
        const burnHash = await walletClient.writeContract({
          address: quote.tokenMessenger,
          abi: tokenMessengerV2Abi,
          functionName: 'depositForBurn',
          args: [
            amountWei,
            quote.destDomain,
            quote.mintRecipient,
            quote.usdc,
            quote.destinationCaller,
            BigInt(quote.maxFee),
            quote.finalityThreshold,
          ],
          chain: walletClient.chain,
          account: address,
        });
        await arcClient.waitForTransactionReceipt({ hash: burnHash });
        sfx.send();
        activePhase = 'relaying';
        patch(id, (b) => ({ ...b, burnTxHash: burnHash, phase: 'relaying' }));

        await api.web3BridgeOut({
          bridgeId: id,
          address: input.userAddress,
          destChainKey: input.destChainKey,
          amountUsdc: input.amountUsdc,
          recipient: input.recipient,
          sourceTxHash: burnHash,
        });
        patch(id, (b) => ({ ...b, phase: 'attesting' }));
      } catch (err) {
        const raw = errorToString(err).toLowerCase();
        const friendly =
          raw.includes('not enough') || raw.includes('insufficient')
            ? 'Your Arc balance is short. Lower the amount and try again.'
            : raw.includes('rejected') || raw.includes('denied')
              ? 'You declined the transaction in your wallet.'
              : 'Bridge-out could not start. Try again in a moment.';
        patch(id, (b) => ({ ...b, phase: 'error', error: friendly }));
      }
    },
    [address, isConnected, walletClient, arcClient, chainId, switchChainAsync, patch],
  );

  return {
    bridges,
    start,
    startCircle,
    startCircleOut,
    startWeb3Out,
    startArcSend,
    startAppKitBridge,
    retry,
    recheck,
    dismiss,
    dismissMany,
    clearCompleted,
    isActive,
  };
}
