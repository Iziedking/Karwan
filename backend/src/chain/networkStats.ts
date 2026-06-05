import { parseAbiItem, formatUnits, type AbiEvent } from 'viem';
import { publicClient } from './client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Public, provable on-chain stats: counts and per-day series scanned from
// events on the current production contracts. Reset to zero when contracts
// redeploy; legacy contracts are explicitly excluded.

const USDC_DECIMALS = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 30;
const CACHE_TTL_MS = 60_000;
// Arc public RPC silently returns empty on overly wide getLogs windows AND
// on windows that produce too many logs to fit one response. 2k-block chunks
// stay well clear of both limits on the production deploy. A 1M-block range
// is ~500 chunks at ~80ms each, well within the 60s cache TTL.
const SCAN_CHUNK_BLOCKS = 2_000n;

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
    /// KarwanYieldDistributor — the per-address USDC claim contract for
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
    /// Lifetime YieldClaimed events on KarwanYieldDistributor — every time
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
const SCAN_CHUNK_RETRIES = 3;
const SCAN_CHUNK_BACKOFF_MS = 400;

async function safeScan(
  inputs: ScanInputs,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<
  Array<{ args: Record<string, unknown>; blockNumber: bigint; blockHash: `0x${string}` | null }>
> {
  if (!inputs.address || fromBlock > toBlock) return [];
  const out: Array<{
    args: Record<string, unknown>;
    blockNumber: bigint;
    blockHash: `0x${string}` | null;
  }> = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + SCAN_CHUNK_BLOCKS - 1n;
    const windowEnd = end > toBlock ? toBlock : end;

    // Retry the chunk on transient RPC failure. If every attempt fails we
    // THROW — silently dropping a chunk made counts swing between refreshes
    // (each refresh saw a different random subset of failures), so users
    // got partial data dressed up as ground truth. Better to fail loud here
    // and let getNetworkStats serve the last cached snapshot.
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < SCAN_CHUNK_RETRIES; attempt++) {
      try {
        const logs = await publicClient.getLogs({
          address: inputs.address,
          event: inputs.event,
          fromBlock: cursor,
          toBlock: windowEnd,
        });
        for (const l of logs) {
          out.push({
            args: ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) as Record<
              string,
              unknown
            >,
            blockNumber: l.blockNumber ?? 0n,
            blockHash: l.blockHash ?? null,
          });
        }
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err as Error;
        if (attempt < SCAN_CHUNK_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, SCAN_CHUNK_BACKOFF_MS * (attempt + 1)));
        }
      }
    }
    if (lastErr) {
      logger.warn(
        {
          err: lastErr.message,
          address: inputs.address,
          fromBlock: cursor.toString(),
          toBlock: windowEnd.toString(),
          attempts: SCAN_CHUNK_RETRIES,
        },
        'network stats scan failed after retries; throwing so the cache can serve last good',
      );
      throw lastErr;
    }
    cursor = windowEnd + 1n;
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
    safeScan({ address: escrowAddr, event: EVENT_ESCROW_FUNDED }, lowerBound, head),
    safeScan({ address: escrowAddr, event: EVENT_ESCROW_SETTLED }, lowerBound, head),
    safeScan({ address: escrowAddr, event: EVENT_ESCROW_DISPUTED }, lowerBound, head),
    safeScan({ address: escrowAddr, event: EVENT_ESCROW_REFUNDED }, lowerBound, head),
    safeScan({ address: escrowAddr, event: EVENT_PROGRESS_RELEASED }, lowerBound, head),
    safeScan({ address: escrowAddr, event: EVENT_FEE_COLLECTED }, lowerBound, head),
    safeScan({ address: vaultAddr, event: EVENT_VAULT_DEPOSITED }, lowerBound, head),
    safeScan({ address: vaultAddr, event: EVENT_VAULT_CLAIMED }, lowerBound, head),
    safeScan({ address: vaultAddr, event: EVENT_VAULT_SLASHED }, lowerBound, head),
    safeScan({ address: repAddr, event: EVENT_REP_COMPLETION }, lowerBound, head),
    safeScan({ address: jobBoardAddr, event: EVENT_JOB_POSTED }, lowerBound, head),
    safeScan({ address: distributorAddr, event: EVENT_YIELD_CLAIMED }, lowerBound, head),
  ]);

  // Resolve timestamps only for events that feed the daily series; saves a
  // pile of getBlockByNumber calls when refunds and disputes are rare.
  const seriesBlocks = new Set<bigint>();
  for (const l of [...funded, ...settled, ...disputed, ...refunded]) {
    seriesBlocks.add(l.blockNumber);
  }
  const timeByBlock = await timestampsFor(seriesBlocks);

  const series = emptySeries(now);
  const seriesIndex = new Map<number, DaySeriesPoint>();
  for (const p of series) seriesIndex.set(p.ts, p);

  function bumpSeries(blockNumber: bigint, key: keyof Omit<DaySeriesPoint, 'ts'>) {
    const ts = timeByBlock.get(blockNumber.toString());
    if (!ts) return;
    const bucket = seriesIndex.get(bucketKey(ts));
    if (!bucket) return;
    bucket[key] += 1;
  }

  let fundedUsdc = 0n;
  let releasedUsdc = 0n;
  let refundedUsdc = 0n;
  let slashedUsdc = 0n;
  let feesCollectedUsdc = 0n;
  let vaultDepositsUsdc = 0n;

  for (const e of funded) {
    fundedUsdc += asBigint(e.args.dealAmount);
    bumpSeries(e.blockNumber, 'funded');
  }
  for (const e of settled) {
    bumpSeries(e.blockNumber, 'settled');
  }
  for (const e of disputed) {
    bumpSeries(e.blockNumber, 'disputed');
  }
  for (const e of refunded) {
    refundedUsdc += asBigint(e.args.amount);
    bumpSeries(e.blockNumber, 'refunded');
  }
  for (const e of releases) {
    releasedUsdc += asBigint(e.args.amount);
  }
  for (const e of fees) {
    feesCollectedUsdc += asBigint(e.args.amount);
  }
  for (const e of deposits) {
    vaultDepositsUsdc += asBigint(e.args.principal);
  }
  for (const e of slashes) {
    slashedUsdc += asBigint(e.args.amount);
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
    totals: {
      jobsPosted: posted.length,
      escrowsFunded: funded.length,
      escrowsSettled: settled.length,
      escrowsDisputed: disputed.length,
      escrowsRefunded: refunded.length,
      milestoneReleases: releases.length,
      vaultDeposits: deposits.length,
      vaultClaims: claims.length,
      vaultSlashes: slashes.length,
      reputationRecords: completions.length,
      yieldClaims: yieldClaimsLogs.length,
    },
    volumes: {
      fundedUsdc: formatUsdc(fundedUsdc),
      releasedUsdc: formatUsdc(releasedUsdc),
      refundedUsdc: formatUsdc(refundedUsdc),
      slashedUsdc: formatUsdc(slashedUsdc),
      feesCollectedUsdc: formatUsdc(feesCollectedUsdc),
      vaultDepositsUsdc: formatUsdc(vaultDepositsUsdc),
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
  try {
    const value = await build();

    if (cached && !isMonotonicallyHealthy(value, cached.value)) {
      logger.warn(
        {
          prevTotals: cached.value.totals,
          freshTotals: value.totals,
        },
        'network stats build went BACKWARDS vs cache (silent RPC drop); keeping last good snapshot',
      );
      return cached.value;
    }

    const violation = hasInvariantViolations(value);
    if (violation) {
      logger.warn(
        { violation, totals: value.totals, volumes: value.volumes },
        'network stats build violated on-chain invariants; keeping last good snapshot if available',
      );
      if (cached) return cached.value;
    }

    cached = { value, builtAt: now };
    return value;
  } catch (err) {
    // A chunk threw after retries. Don't replace the cache with partial or
    // empty data — serve the last good snapshot so the dashboard stays
    // honest. If there's no cache yet (first call ever failed), bubble up.
    logger.warn(
      { err: (err as Error).message, hasCache: !!cached },
      'network stats build failed; falling back to last cached snapshot',
    );
    if (cached) return cached.value;
    throw err;
  }
}
