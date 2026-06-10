import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { publicClient } from './client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

/// Shared in-memory cache of every KarwanVault position, refreshed by a
/// periodic background scan and served by `GET /api/vault/positions`. Before
/// this module landed, every read of a single address's positions walked the
/// full positionId space on chain (N eth_calls per request). With one user
/// staking under 25 positions that's fine, but as `nextPositionId` grows the
/// per-request cost grows linearly. The cache turns repeat reads into an
/// in-memory filter and bounds the chain-call rate to one full sweep every
/// `SCAN_INTERVAL_MS`. The snapshot also persists to `data/vaultScan.json` so
/// a fresh process boot doesn't serve empty `/positions` while the first
/// scan is still in flight; the boot prefetch fires the first scan
/// immediately, but the disk snapshot fills the gap.

const STATE_PATH = resolve(process.cwd(), 'data', 'vaultScan.json');
const SCAN_INTERVAL_MS = 5 * 60 * 1000;

const vaultAbi = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'depositedAt', type: 'uint64' },
      { name: 'cooldownStartedAt', type: 'uint64' },
      { name: 'claimableAt', type: 'uint64' },
      { name: 'state', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'nextPositionId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export interface PositionRow {
  positionId: string;
  owner: string;
  principalWei: string;
  depositedAt: number;
  cooldownStartedAt: number;
  claimableAt: number;
  state: number;
}

interface PersistedSnapshot {
  vaultAddress: string;
  lastScannedAt: number;
  lastSeenNextId: string;
  synced: boolean;
  positions: PositionRow[];
}

interface CacheState {
  vaultAddress: string | null;
  positions: Map<string, PositionRow>;
  lastSeenNextId: bigint;
  lastScannedAt: number;
  synced: boolean;
}

const state: CacheState = {
  vaultAddress: null,
  positions: new Map(),
  lastSeenNextId: -1n,
  lastScannedAt: 0,
  synced: false,
};

/// Shared lock so concurrent reads cooperate on a single in-flight scan
/// instead of each kicking off its own and amplifying the chain-call rate.
let scanInFlight: Promise<void> | null = null;

function vaultAddress(): `0x${string}` | null {
  const v = (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_ADDR;
  return v ? (v as `0x${string}`) : null;
}

function loadSnapshot(currentVault: string): void {
  if (!existsSync(STATE_PATH)) return;
  try {
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as PersistedSnapshot;
    /// If the vault address changed (contract redeploy), the snapshot is
    /// for a different contract and would serve wrong rows. Drop it.
    if (parsed.vaultAddress.toLowerCase() !== currentVault.toLowerCase()) {
      logger.info(
        { snapshot: parsed.vaultAddress, current: currentVault },
        'vault scan: snapshot vault address differs from current; discarding',
      );
      return;
    }
    state.vaultAddress = parsed.vaultAddress.toLowerCase();
    state.lastScannedAt = parsed.lastScannedAt;
    state.synced = parsed.synced;
    try {
      state.lastSeenNextId = BigInt(parsed.lastSeenNextId);
    } catch {
      state.lastSeenNextId = -1n;
    }
    for (const row of parsed.positions) {
      state.positions.set(row.positionId, row);
    }
    logger.info(
      { count: state.positions.size, lastScannedAt: state.lastScannedAt },
      'vault scan: snapshot loaded',
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'vault scan: snapshot load failed');
  }
}

function persistSnapshot(): void {
  if (!state.vaultAddress) return;
  try {
    const dir = dirname(STATE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: PersistedSnapshot = {
      vaultAddress: state.vaultAddress,
      lastScannedAt: state.lastScannedAt,
      lastSeenNextId: state.lastSeenNextId.toString(),
      synced: state.synced,
      positions: Array.from(state.positions.values()),
    };
    writeFileSync(STATE_PATH, JSON.stringify(payload), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'vault scan: snapshot persist failed');
  }
}

async function runScan(): Promise<void> {
  const vault = vaultAddress();
  if (!vault) return;
  /// Detect a vault-address swap (env-driven contract redeploy) and wipe
  /// the in-memory map so the new contract's rows don't merge with the old.
  if (state.vaultAddress && state.vaultAddress !== vault.toLowerCase()) {
    state.positions.clear();
    state.lastSeenNextId = -1n;
    state.synced = false;
  }
  state.vaultAddress = vault.toLowerCase();

  let nextId: bigint;
  try {
    nextId = (await publicClient.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'nextPositionId',
    })) as bigint;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'vault scan: nextPositionId read failed; keeping prior snapshot',
    );
    state.synced = false;
    return;
  }
  if (nextId < 0n) {
    state.lastSeenNextId = 0n;
    state.synced = true;
    state.lastScannedAt = Date.now();
    persistSnapshot();
    return;
  }

  /// Re-scan every id 0..nextId. The cache is the source of truth so a row
  /// transitioning Active -> Cooling -> Withdrawn lands in the cache on the
  /// next scan tick. The per-id allowFailure pattern means a partial-fail
  /// scan still updates everything that did succeed and marks `synced` false
  /// so the UI knows totals are provisional.
  const ids: bigint[] = [];
  for (let i = 0n; i <= nextId; i++) ids.push(i);
  const results = await Promise.allSettled(
    ids.map((id) =>
      publicClient.readContract({
        address: vault,
        abi: vaultAbi,
        functionName: 'positions',
        args: [id],
      }),
    ),
  );

  let anyFailed = false;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (!r || r.status !== 'fulfilled') {
      anyFailed = true;
      continue;
    }
    const tuple = r.value as readonly [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
    ];
    const positionId = ids[i]!.toString();
    state.positions.set(positionId, {
      positionId,
      owner: tuple[0].toLowerCase(),
      principalWei: tuple[1].toString(),
      depositedAt: Number(tuple[2]),
      cooldownStartedAt: Number(tuple[3]),
      claimableAt: Number(tuple[4]),
      state: tuple[5],
    });
  }

  state.lastSeenNextId = nextId;
  state.lastScannedAt = Date.now();
  state.synced = !anyFailed;
  persistSnapshot();
}

/// Refresh the cache and wait for it. Concurrent callers share a single
/// in-flight scan so a burst of reads doesn't multiply chain calls.
export async function refreshVaultScan(): Promise<void> {
  if (scanInFlight) return scanInFlight;
  scanInFlight = runScan().finally(() => {
    scanInFlight = null;
  });
  return scanInFlight;
}

export interface OwnerPositionsView {
  positions: PositionRow[];
  synced: boolean;
  lastScannedAt: number;
}

/// Filter the cache for one owner. Returns rows in any non-None state; the
/// caller decides how to render active vs cooling vs claimed. When the cache
/// has never been populated (cold boot, snapshot absent), force a single
/// in-flight refresh so the first reader doesn't get an empty answer.
export async function getPositionsByOwner(addressRaw: string): Promise<OwnerPositionsView> {
  if (state.positions.size === 0 && state.lastScannedAt === 0) {
    await refreshVaultScan();
  }
  const owner = addressRaw.toLowerCase();
  const rows: PositionRow[] = [];
  for (const row of state.positions.values()) {
    if (row.owner !== owner) continue;
    if (row.state === 0) continue;
    rows.push(row);
  }
  rows.sort((a, b) => Number(BigInt(b.positionId) - BigInt(a.positionId)));
  return {
    positions: rows,
    synced: state.synced,
    lastScannedAt: state.lastScannedAt,
  };
}

/// Start the boot prefetch + periodic refresh. The first scan fires
/// immediately (non-blocking, the boot sequence is not held up by it). A
/// snapshot on disk fills the window between boot and first scan completing.
export function startVaultScanWatcher(): () => void {
  const vault = vaultAddress();
  if (!vault) {
    logger.warn('vault scan: KARWAN_VAULT_ADDR unset, not starting');
    return () => {};
  }
  loadSnapshot(vault);
  void refreshVaultScan().catch((err) =>
    logger.warn({ err: (err as Error).message }, 'vault scan: initial refresh failed'),
  );
  const timer = setInterval(() => {
    void refreshVaultScan().catch((err) =>
      logger.warn({ err: (err as Error).message }, 'vault scan: periodic refresh failed'),
    );
  }, SCAN_INTERVAL_MS);
  return () => clearInterval(timer);
}
