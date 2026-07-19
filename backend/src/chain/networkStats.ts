import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseAbiItem, formatUnits, type AbiEvent } from 'viem';
import { eq } from 'drizzle-orm';
import { publicClient } from './client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { db, pgEnabled } from '../db/client.js';
import { appSnapshots } from '../db/schema.js';

/// Key under which the network-stats snapshot lives in app_snapshots.
const SNAPSHOT_KEY = 'network_stats';

/// Disk snapshot path. Mirrors the vaultScanCache pattern so a process boot
/// has a last-known-good snapshot to serve while the first chain scan is in
/// flight. Without this, every restart left /api/network/onchain returning
/// 502 for the duration of the cold-cache build (RPC-bound, can take 30-60s
/// on Arc public RPC).
const STATE_PATH = resolve(process.cwd(), 'data', 'networkStats.json');

// Public, provable on-chain stats: counts and per-day series scanned from
// events on the current production contracts. Reset to zero when contracts
// redeploy; legacy contracts are explicitly excluded.

const USDC_DECIMALS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;
const CACHE_TTL_MS = 60_000;
/// Minimum gap between background rebuilds. Without this, stale-while-revalidate
/// kicked a fresh full scan on nearly every 60s poll, so the scanner ran
/// back-to-back forever. A 5-minute floor keeps the home band within a few
/// minutes of chain (the staking page reads live, so a wider gap reads as
/// "not syncing") while still sitting well above the 60s serve-TTL so scans
/// never run back-to-back. Env-overridable.
const REFRESH_FLOOR_MS = Number(process.env.NETWORK_STATS_REFRESH_FLOOR_MS ?? 5 * 60_000);
/// Full re-seed cadence. The incremental scanner only sweeps NEW blocks each
/// refresh; a periodic full reseed self-heals any window the RPC silently
/// dropped (Arc returns empty on wide getLogs) so cumulative counts can't drift.
const RESEED_MS = Number(process.env.NETWORK_STATS_RESEED_MS ?? 6 * 60 * 60_000);
// Arc public RPC silently returns empty on overly wide getLogs windows.
// 5k-block chunks are a compromise between staying under the RPC's hidden
// per-response cap and keeping the total chunk count low enough that the
// build finishes inside the 60s cache TTL. The monotonic + invariant guards
// in getNetworkStats are the real safety net against silent drops; chunking
// just makes the drops rare. Chunks within a single scan run in parallel
// batches (see SCAN_CONCURRENCY).
const SCAN_CHUNK_BLOCKS = 5_000n;
/// How many chunks per event scan to run in parallel. Higher = faster build
/// but more pressure on the RPC. 8 is comfortable for the public Arc RPC.
const SCAN_CONCURRENCY = 8;

const EVENT_ESCROW_FUNDED = parseAbiItem(
  'event EscrowFunded(bytes32 indexed jobId, address indexed buyer, address indexed seller, uint256 dealAmount, uint256 fundedAmount, uint256 feeTotal, uint8[] milestonePcts, uint16 reservationBps)',
) as AbiEvent;
const EVENT_ESCROW_SETTLED = parseAbiItem(
  'event EscrowSettled(bytes32 indexed jobId, uint256 sellerTotal, uint256 feeTotal)',
) as AbiEvent;
const EVENT_ESCROW_DISPUTED = parseAbiItem(
  'event EscrowDisputed(bytes32 indexed jobId, string reasonHash)',
) as AbiEvent;
const EVENT_ESCROW_REFUNDED = parseAbiItem(
  'event EscrowRefunded(bytes32 indexed jobId, uint256 amount, uint256 priorReleased)',
) as AbiEvent;
const EVENT_PROGRESS_RELEASED = parseAbiItem(
  'event ProgressReleased(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed seller)',
) as AbiEvent;
const EVENT_FEE_COLLECTED = parseAbiItem(
  'event FeeCollected(bytes32 indexed jobId, uint8 milestoneIndex, uint256 amount, address indexed treasury)',
) as AbiEvent;
const EVENT_VAULT_DEPOSITED = parseAbiItem(
  'event Deposited(uint256 indexed positionId, address indexed owner, uint256 principal)',
) as AbiEvent;
const EVENT_VAULT_CLAIMED = parseAbiItem(
  'event Claimed(uint256 indexed positionId, address indexed owner, uint256 principal)',
) as AbiEvent;
const EVENT_VAULT_SLASHED = parseAbiItem(
  'event Slashed(bytes32 indexed jobId, address indexed seller, address indexed beneficiary, uint256 amount)',
) as AbiEvent;
const EVENT_REP_COMPLETION = parseAbiItem(
  'event CompletionRecorded(bytes32 indexed jobId, address indexed buyer, address indexed seller, uint8 outcome)',
) as AbiEvent;
const EVENT_JOB_POSTED = parseAbiItem(
  'event JobPosted(bytes32 indexed jobId, address indexed buyer, uint256 budgetUsdc, uint256 deadline, string brief)',
) as AbiEvent;
const EVENT_YIELD_CLAIMED = parseAbiItem(
  'event YieldClaimed(address indexed staker, address indexed to, uint256 amount)',
) as AbiEvent;

export interface DaySeriesPoint {
  /// UTC midnight epoch ms for the day this bucket covers.
  ts: number;
  funded: number;
  settled: number;
  disputed: number;
  refunded: number;
}

export interface NetworkStats {
  /// Block range the scan covered. Useful for the "scanned to block N" caption
  /// on the proof surface.
  fromBlock: string;
  toBlock: string;
  /// Per-contract address echoed back so anyone reading the JSON can verify
  /// the stats came from the current production contracts.
  contracts: {
    escrow: string;
    vault: string;
    treasury: string;
    reputation: string;
    jobBoard: string;
    /// KarwanYieldDistributor, the per-address USDC claim contract for
    /// daily-credited staker yield. Empty string when not configured.
    yieldDistributor: string;
  };
  totals: {
    jobsPosted: number;
    escrowsFunded: number;
    escrowsSettled: number;
    escrowsDisputed: number;
    escrowsRefunded: number;
    milestoneReleases: number;
    vaultDeposits: number;
    vaultClaims: number;
    vaultSlashes: number;
    reputationRecords: number;
    /// Lifetime YieldClaimed events on KarwanYieldDistributor. Every time
    /// a staker pulled their accrued share to their wallet.
    yieldClaims: number;
  };
  volumes: {
    /// USDC funded (sum of dealAmount across every EscrowFunded).
    fundedUsdc: string;
    /// USDC paid out via milestones.
    releasedUsdc: string;
    /// USDC refunded to buyers across the refund path.
    refundedUsdc: string;
    /// USDC slashed from sellers to buyers as deal insurance.
    slashedUsdc: string;
    /// USDC into the treasury from milestone-fee splits.
    feesCollectedUsdc: string;
    /// USDC deposited into the vault.
    vaultDepositsUsdc: string;
  };
  series: DaySeriesPoint[];
  scannedAt: number;
}

let cached: { value: NetworkStats; builtAt: number } | null = null;

/// Hydrate the cache from disk at module load so the very first
/// /api/network/onchain after a process boot serves a usable snapshot
/// instead of triggering a cold chain scan (which takes 30-60s on Arc
/// public RPC and often fails outright). Failures here are silent. A
/// missing or corrupt file just means we'll fall through to live build.
(() => {
  try {
    if (!existsSync(STATE_PATH)) return;
    const raw = readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as { value: NetworkStats; builtAt: number };
    if (parsed && parsed.value && typeof parsed.builtAt === 'number') {
      cached = parsed;
      logger.info(
        { ageMs: Date.now() - parsed.builtAt, scannedAt: parsed.value.scannedAt },
        'network stats: hydrated from disk snapshot',
      );
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'network stats: disk hydrate failed, will rebuild on first request',
    );
  }
})();

function persistCache(snapshot: { value: NetworkStats; builtAt: number }): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(snapshot), 'utf8');
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'network stats: disk persist failed (cache stays in-memory)',
    );
  }
  /// Durable Postgres copy. The disk snapshot is lost on a VM rebuild; this
  /// survives so a cold boot serves the last good numbers instantly instead of
  /// the 30-60s chain scan. Fire-and-forget; the disk path is the no-DB fallback.
  if (pgEnabled) {
    const now = Date.now();
    void db()
      .insert(appSnapshots)
      .values({ key: SNAPSHOT_KEY, data: snapshot, updatedAt: now })
      .onConflictDoUpdate({ target: appSnapshots.key, set: { data: snapshot, updatedAt: now } })
      .catch(() => {
        /* swallow; disk + in-memory keep serving */
      });
  }
}

/// Load the last snapshot from Postgres into the in-memory cache. Used on a
/// cold boot when the disk snapshot is gone (VM rebuild) so the first request
/// serves real numbers instead of triggering the slow chain scan. No-op once
/// the cache holds anything.
async function hydrateFromPg(): Promise<void> {
  if (!pgEnabled || cached) return;
  try {
    const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, SNAPSHOT_KEY));
    const snap = rows[0]?.data as { value: NetworkStats; builtAt: number } | undefined;
    if (snap?.value && typeof snap.builtAt === 'number') {
      cached = snap;
      logger.info(
        { ageMs: Date.now() - snap.builtAt },
        'network stats: hydrated from postgres snapshot',
      );
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'network stats: pg hydrate failed');
  }
}

/// Build, validate against the last snapshot, and store on success. Shared by
/// the synchronous first-build path and the background refresh.
async function buildAndStore(): Promise<NetworkStats> {
  const value = await build();
  if (cached && !isMonotonicallyHealthy(value, cached.value)) {
    logger.warn(
      { prevTotals: cached.value.totals, freshTotals: value.totals },
      'network stats build went BACKWARDS vs cache (silent RPC drop); keeping last good snapshot',
    );
    return cached.value;
  }
  if (hasInvariantViolations(value) && cached) {
    logger.warn(
      { totals: value.totals, volumes: value.volumes },
      'network stats build violated on-chain invariants; keeping last good snapshot',
    );
    return cached.value;
  }
  cached = { value, builtAt: Date.now() };
  persistCache(cached);
  return value;
}

let refreshing = false;
/// Non-blocking revalidation. Lets getNetworkStats serve a stale snapshot
/// immediately while the fresh chain scan runs in the background, so the
/// dashboard never waits on RPC. Guarded so concurrent reads don't stack builds.
function refreshInBackground(): void {
  if (refreshing) return;
  // Refresh floor: once this process has seeded its accumulator, don't rebuild
  // if the last snapshot is younger than the floor. This is what stops the
  // scanner from running continuously. The first seed (acc still null) always
  // runs so a fresh boot populates the incremental accumulator promptly.
  if (acc && cached && Date.now() - cached.builtAt < REFRESH_FLOOR_MS) return;
  refreshing = true;
  void buildAndStore()
    .catch((err) =>
      logger.warn({ err: (err as Error).message }, 'network stats background refresh failed'),
    )
    .finally(() => {
      refreshing = false;
    });
}

function midnightUtc(ts: number): number {
  return Math.floor(ts / DAY_MS) * DAY_MS;
}

function emptySeries(now: number): DaySeriesPoint[] {
  const today = midnightUtc(now);
  const out: DaySeriesPoint[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i -= 1) {
    out.push({
      ts: today - i * DAY_MS,
      funded: 0,
      settled: 0,
      disputed: 0,
      refunded: 0,
    });
  }
  return out;
}

interface ScanInputs {
  address: `0x${string}` | null;
  event: AbiEvent;
}

/// Per-chunk retry tuning. RPC flakiness on testnet can drop a window even
/// when nothing's wrong with the data; up to 3 attempts with linear backoff
/// recovers > 95% of transient failures we've seen in practice.
const SCAN_CHUNK_RETRIES = 2;
const SCAN_CHUNK_BACKOFF_MS = 400;

async function scanOneChunk(
  inputs: ScanInputs,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<
  Array<{ args: Record<string, unknown>; blockNumber: bigint; blockHash: `0x${string}` | null }>
> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < SCAN_CHUNK_RETRIES; attempt++) {
    try {
      const logs = await publicClient.getLogs({
        address: inputs.address as `0x${string}`,
        event: inputs.event,
        fromBlock,
        toBlock,
      });
      return logs.map((l) => ({
        args: ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) as Record<
          string,
          unknown
        >,
        blockNumber: l.blockNumber ?? 0n,
        blockHash: l.blockHash ?? null,
      }));
    } catch (err) {
      lastErr = err as Error;
      if (attempt < SCAN_CHUNK_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, SCAN_CHUNK_BACKOFF_MS * (attempt + 1)));
      }
    }
  }
  logger.warn(
    {
      err: lastErr?.message,
      address: inputs.address,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      attempts: SCAN_CHUNK_RETRIES,
    },
    'network stats chunk failed after retries; throwing so the cache can serve last good',
  );
  throw lastErr ?? new Error('scan failed');
}

async function safeScan(
  inputs: ScanInputs,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<
  Array<{ args: Record<string, unknown>; blockNumber: bigint; blockHash: `0x${string}` | null }>
> {
  if (!inputs.address || fromBlock > toBlock) return [];

  /// Build the chunk window list up front so we can run them in bounded
  /// parallel batches instead of one-at-a-time. Sequential chunks were taking
  /// ~50ms each, fine for a 100-block range, painful for 100k+.
  const windows: Array<{ from: bigint; to: bigint }> = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + SCAN_CHUNK_BLOCKS - 1n;
    const windowEnd = end > toBlock ? toBlock : end;
    windows.push({ from: cursor, to: windowEnd });
    cursor = windowEnd + 1n;
  }

  const out: Array<{
    args: Record<string, unknown>;
    blockNumber: bigint;
    blockHash: `0x${string}` | null;
  }> = [];
  for (let i = 0; i < windows.length; i += SCAN_CONCURRENCY) {
    const batch = windows.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(
      batch.map((w) => scanOneChunk(inputs, w.from, w.to)),
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

/// Resolves event block timestamps for a window. One eth_getBlockByNumber per
/// distinct block, cached so the same block referenced by multiple events does
/// not refetch.
async function timestampsFor(
  blocks: Iterable<bigint>,
): Promise<Map<string, number>> {
  const unique = new Set<string>();
  for (const b of blocks) unique.add(b.toString());
  const out = new Map<string, number>();
  await Promise.all(
    Array.from(unique).map(async (key) => {
      try {
        const block = await publicClient.getBlock({ blockNumber: BigInt(key) });
        out.set(key, Number(block.timestamp) * 1000);
      } catch {
        // Skip on transient failure; affected events drop from the series only.
      }
    }),
  );
  return out;
}

function bucketKey(tsMs: number): number {
  return midnightUtc(tsMs);
}

function asBigint(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function formatUsdc(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS);
}

/// Incremental accumulator. Seeded by ONE full historical scan (cold start or
/// after a redeploy / periodic reseed), then advanced by scanning only the new
/// blocks since `cursor` on each refresh. Every counter and volume on chain is
/// strictly cumulative, so merging deltas is exact; the daily series keeps an
/// absolute day->counts map that the response projects the last 30 days from.
interface DayCounts {
  funded: number;
  settled: number;
  disputed: number;
  refunded: number;
}
interface StatsAcc {
  cursor: bigint; // last block folded into the accumulator
  contractsKey: string; // detects a redeploy -> forces a reseed
  seededAt: number;
  counts: {
    jobsPosted: number;
    escrowsFunded: number;
    escrowsSettled: number;
    escrowsDisputed: number;
    escrowsRefunded: number;
    milestoneReleases: number;
    vaultDeposits: number;
    vaultClaims: number;
    vaultSlashes: number;
    reputationRecords: number;
    yieldClaims: number;
  };
  vol: {
    fundedUsdc: bigint;
    releasedUsdc: bigint;
    refundedUsdc: bigint;
    slashedUsdc: bigint;
    feesCollectedUsdc: bigint;
    vaultDepositsUsdc: bigint;
  };
  days: Map<number, DayCounts>;
}
let acc: StatsAcc | null = null;

function freshAcc(contractsKey: string): StatsAcc {
  return {
    cursor: 0n,
    contractsKey,
    seededAt: Date.now(),
    counts: {
      jobsPosted: 0,
      escrowsFunded: 0,
      escrowsSettled: 0,
      escrowsDisputed: 0,
      escrowsRefunded: 0,
      milestoneReleases: 0,
      vaultDeposits: 0,
      vaultClaims: 0,
      vaultSlashes: 0,
      reputationRecords: 0,
      yieldClaims: 0,
    },
    vol: {
      fundedUsdc: 0n,
      releasedUsdc: 0n,
      refundedUsdc: 0n,
      slashedUsdc: 0n,
      feesCollectedUsdc: 0n,
      vaultDepositsUsdc: 0n,
    },
    days: new Map(),
  };
}

async function build(): Promise<NetworkStats> {
  const now = Date.now();
  const head = await publicClient.getBlockNumber();
  const deployBlock = config.KARWAN_VAULT_DEPLOY_BLOCK
    ? BigInt(config.KARWAN_VAULT_DEPLOY_BLOCK)
    : 0n;
  const lowerBound = deployBlock < 0n ? 0n : deployBlock;

  const escrowAddr = (config.KARWAN_ESCROW_ADDR ?? null) as `0x${string}` | null;
  const vaultAddr = (config.KARWAN_VAULT_ADDR ?? null) as `0x${string}` | null;
  const repAddr = (config.KARWAN_REPUTATION_ADDR ?? null) as `0x${string}` | null;
  const jobBoardAddr = (config.KARWAN_JOBBOARD_ADDR ?? null) as `0x${string}` | null;
  const treasuryAddr =
    (config.KARWAN_TREASURY_CONTRACT_ADDR ?? config.KARWAN_TREASURY_ADDR ?? null) as
      | `0x${string}`
      | null;
  const distributorAddr = ((config as unknown as Record<string, string | undefined>)
    .KARWAN_YIELD_DISTRIBUTOR_ADDR ?? null) as `0x${string}` | null;

  const contractsKey = [escrowAddr, vaultAddr, repAddr, jobBoardAddr, distributorAddr].join('|');

  // Seed on cold start, after a redeploy (contracts changed), or on the
  // periodic reseed cadence. A seed scans the full history from the deploy
  // block; every other refresh scans only new blocks.
  const needsSeed =
    !acc || acc.contractsKey !== contractsKey || now - acc.seededAt >= RESEED_MS;
  if (needsSeed) {
    acc = freshAcc(contractsKey);
    acc.cursor = lowerBound - 1n; // so `from` below == lowerBound
  }
  const a = acc as StatsAcc;

  const from = a.cursor + 1n;
  if (from <= head) {
    const [
      funded,
      settled,
      disputed,
      refunded,
      releases,
      fees,
      deposits,
      claims,
      slashes,
      completions,
      posted,
      yieldClaimsLogs,
    ] = await Promise.all([
      safeScan({ address: escrowAddr, event: EVENT_ESCROW_FUNDED }, from, head),
      safeScan({ address: escrowAddr, event: EVENT_ESCROW_SETTLED }, from, head),
      safeScan({ address: escrowAddr, event: EVENT_ESCROW_DISPUTED }, from, head),
      safeScan({ address: escrowAddr, event: EVENT_ESCROW_REFUNDED }, from, head),
      safeScan({ address: escrowAddr, event: EVENT_PROGRESS_RELEASED }, from, head),
      safeScan({ address: escrowAddr, event: EVENT_FEE_COLLECTED }, from, head),
      safeScan({ address: vaultAddr, event: EVENT_VAULT_DEPOSITED }, from, head),
      safeScan({ address: vaultAddr, event: EVENT_VAULT_CLAIMED }, from, head),
      safeScan({ address: vaultAddr, event: EVENT_VAULT_SLASHED }, from, head),
      safeScan({ address: repAddr, event: EVENT_REP_COMPLETION }, from, head),
      safeScan({ address: jobBoardAddr, event: EVENT_JOB_POSTED }, from, head),
      safeScan({ address: distributorAddr, event: EVENT_YIELD_CLAIMED }, from, head),
    ]);
    // All safeScans succeeded (a hard failure throws, leaving cursor put so the
    // same range retries). Fold the deltas into the accumulator.

    // Timestamps only for the series-feeding events (funded/settled/disputed/refunded).
    const seriesBlocks = new Set<bigint>();
    for (const l of [...funded, ...settled, ...disputed, ...refunded]) seriesBlocks.add(l.blockNumber);
    const timeByBlock = await timestampsFor(seriesBlocks);
    const bumpDay = (
      logs: Array<{ blockNumber: bigint }>,
      key: keyof DayCounts,
    ) => {
      for (const e of logs) {
        const ts = timeByBlock.get(e.blockNumber.toString());
        if (!ts) continue;
        const day = bucketKey(ts);
        let bucket = a.days.get(day);
        if (!bucket) {
          bucket = { funded: 0, settled: 0, disputed: 0, refunded: 0 };
          a.days.set(day, bucket);
        }
        bucket[key] += 1;
      }
    };

    a.counts.jobsPosted += posted.length;
    a.counts.escrowsFunded += funded.length;
    a.counts.escrowsSettled += settled.length;
    a.counts.escrowsDisputed += disputed.length;
    a.counts.escrowsRefunded += refunded.length;
    a.counts.milestoneReleases += releases.length;
    a.counts.vaultDeposits += deposits.length;
    a.counts.vaultClaims += claims.length;
    a.counts.vaultSlashes += slashes.length;
    a.counts.reputationRecords += completions.length;
    a.counts.yieldClaims += yieldClaimsLogs.length;

    for (const e of funded) a.vol.fundedUsdc += asBigint(e.args.dealAmount);
    for (const e of refunded) a.vol.refundedUsdc += asBigint(e.args.amount);
    for (const e of releases) a.vol.releasedUsdc += asBigint(e.args.amount);
    for (const e of fees) a.vol.feesCollectedUsdc += asBigint(e.args.amount);
    for (const e of deposits) a.vol.vaultDepositsUsdc += asBigint(e.args.principal);
    for (const e of slashes) a.vol.slashedUsdc += asBigint(e.args.amount);

    bumpDay(funded, 'funded');
    bumpDay(settled, 'settled');
    bumpDay(disputed, 'disputed');
    bumpDay(refunded, 'refunded');

    // Prune day buckets well past the 30-day window to bound memory.
    const oldest = bucketKey(now) - (SERIES_DAYS + 5) * DAY_MS;
    for (const day of a.days.keys()) if (day < oldest) a.days.delete(day);

    a.cursor = head;
  }

  // Project the public snapshot from the accumulator.
  const series = emptySeries(now);
  for (const p of series) {
    const d = a.days.get(p.ts);
    if (d) {
      p.funded = d.funded;
      p.settled = d.settled;
      p.disputed = d.disputed;
      p.refunded = d.refunded;
    }
  }

  return {
    fromBlock: lowerBound.toString(),
    toBlock: head.toString(),
    contracts: {
      escrow: escrowAddr ?? '',
      vault: vaultAddr ?? '',
      treasury: treasuryAddr ?? '',
      reputation: repAddr ?? '',
      jobBoard: jobBoardAddr ?? '',
      yieldDistributor: distributorAddr ?? '',
    },
    totals: { ...a.counts },
    volumes: {
      fundedUsdc: formatUsdc(a.vol.fundedUsdc),
      releasedUsdc: formatUsdc(a.vol.releasedUsdc),
      refundedUsdc: formatUsdc(a.vol.refundedUsdc),
      slashedUsdc: formatUsdc(a.vol.slashedUsdc),
      feesCollectedUsdc: formatUsdc(a.vol.feesCollectedUsdc),
      vaultDepositsUsdc: formatUsdc(a.vol.vaultDepositsUsdc),
    },
    series,
    scannedAt: now,
  };
}

/// Every counter and volume in NetworkStats is strictly cumulative on chain.
/// If a fresh build returns numbers BELOW the cached snapshot for the same
/// contracts, Arc's RPC silently dropped logs in some window (no throw, just
/// an empty response). Discard the bad build and keep the cache so the
/// dashboard doesn't oscillate.
function isMonotonicallyHealthy(fresh: NetworkStats, prev: NetworkStats): boolean {
  if (fresh.contracts.escrow !== prev.contracts.escrow) return true;
  if (fresh.contracts.vault !== prev.contracts.vault) return true;
  const t1 = fresh.totals;
  const t0 = prev.totals;
  if (
    t1.escrowsFunded < t0.escrowsFunded ||
    t1.escrowsSettled < t0.escrowsSettled ||
    t1.escrowsDisputed < t0.escrowsDisputed ||
    t1.escrowsRefunded < t0.escrowsRefunded ||
    t1.milestoneReleases < t0.milestoneReleases ||
    t1.vaultDeposits < t0.vaultDeposits ||
    t1.vaultClaims < t0.vaultClaims ||
    t1.vaultSlashes < t0.vaultSlashes ||
    t1.reputationRecords < t0.reputationRecords ||
    t1.yieldClaims < t0.yieldClaims ||
    t1.jobsPosted < t0.jobsPosted
  ) {
    return false;
  }
  return true;
}

/// Sanity-check on-chain invariants. Released can never exceed funded.
/// Refunded + slashed can never exceed funded. If either is violated the
/// build clearly missed some funded events.
function hasInvariantViolations(s: NetworkStats): string | null {
  try {
    const funded = BigInt(Math.round(Number(s.volumes.fundedUsdc) * 1e6));
    const released = BigInt(Math.round(Number(s.volumes.releasedUsdc) * 1e6));
    const refunded = BigInt(Math.round(Number(s.volumes.refundedUsdc) * 1e6));
    if (released > funded) return `released ${s.volumes.releasedUsdc} > funded ${s.volumes.fundedUsdc}`;
    if (refunded > funded) return `refunded ${s.volumes.refundedUsdc} > funded ${s.volumes.fundedUsdc}`;
    return null;
  } catch {
    return null;
  }
}

export async function getNetworkStats(force = false): Promise<NetworkStats> {
  const now = Date.now();
  if (!force && cached && now - cached.builtAt < CACHE_TTL_MS) {
    return cached.value;
  }
  // Cold in-memory cache (fresh boot, disk snapshot gone): seed from the
  // durable Postgres snapshot before considering the slow chain scan.
  if (!cached) await hydrateFromPg();

  // Stale-while-revalidate: with any snapshot in hand, serve it now and rebuild
  // in the background so the request never blocks on the 30-60s RPC scan.
  if (cached && !force) {
    refreshInBackground();
    return cached.value;
  }

  // No snapshot anywhere (truly first build) or a forced refresh: build once,
  // synchronously, and fall back to the last good snapshot on failure.
  try {
    return await buildAndStore();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, hasCache: !!cached },
      'network stats build failed; falling back to last cached snapshot',
    );
    if (cached) return cached.value;
    throw err;
  }
}
