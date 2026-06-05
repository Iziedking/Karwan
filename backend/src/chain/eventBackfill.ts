import { formatUnits, type AbiEvent } from 'viem';
import { publicClient } from './client.js';
import { config } from '../config.js';
import { bus, type KarwanEvent, type KarwanEventType } from '../events.js';
import { logger } from '../logger.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';

/// Resolve an event definition by name from a contract ABI. Using the actual
/// ABI guarantees we get the contract's real parameter types (uint64 vs
/// uint256, etc) — viem matches events by topic hash, which depends on those
/// types, so a hand-rolled `parseAbiItem` with one wrong type silently
/// returns zero logs. Bedeviled networkStats once already.
function eventByName(abi: readonly unknown[], name: string): AbiEvent {
  for (const item of abi) {
    const entry = item as { type?: string; name?: string };
    if (entry.type === 'event' && entry.name === name) return entry as unknown as AbiEvent;
  }
  throw new Error(`event ${name} not found in ABI`);
}

/// One-shot replay of on-chain events into the bus history. Runs on boot when
/// data/events.json is missing or empty (a fresh deploy or VPS restore) so the
/// /activity feed comes up populated instead of waiting for live traffic.
/// Events go through `bus.injectHistorical` which writes straight into the
/// ring buffer and skips the EventEmitter — Telegram + SSE never see these as
/// live, no spam.
///
/// Scope: the chain-derivable subset of `PUBLIC_EVENT_TYPES`. Off-chain events
/// (deal.matched proposals, counter offers via agent, listing.* off-chain
/// rows) have no log to recover from and stay missing until live traffic.

const USDC_DECIMALS = 6;
/// 5k matches the networkStats + yield route chunkers. Arc's public RPC
/// silently returns empty windows wider than that on a non-trivial fraction
/// of calls. Combined with per-chunk retry + parallel batching, this gives
/// the backfill a real chance to recover after a docker restart that wiped
/// data/events.json.
const SCAN_CHUNK_BLOCKS = 5_000n;
const SCAN_CHUNK_RETRIES = 3;
const SCAN_CHUNK_BACKOFF_MS = 400;
const SCAN_CONCURRENCY = 8;
const HISTORY_CAPACITY = 500;

/// Resolve every event the backfill needs up front. A missing name is logged
/// and the corresponding scan is skipped (the rest still run) so an ABI
/// trim or rename never crashes the boot, just degrades coverage.
interface EventSpec {
  key: string;
  abi: readonly unknown[];
  name: string;
}
const EVENT_SPECS: EventSpec[] = [
  { key: 'JobPosted', abi: jobBoardAbi, name: 'JobPosted' },
  { key: 'BidSubmitted', abi: jobBoardAbi, name: 'BidSubmitted' },
  { key: 'BidAccepted', abi: jobBoardAbi, name: 'BidAccepted' },
  { key: 'EscrowFunded', abi: escrowAbi, name: 'EscrowFunded' },
  { key: 'ProgressReleased', abi: escrowAbi, name: 'ProgressReleased' },
  { key: 'EscrowSettled', abi: escrowAbi, name: 'EscrowSettled' },
  { key: 'EscrowDisputed', abi: escrowAbi, name: 'EscrowDisputed' },
  { key: 'EscrowRefunded', abi: escrowAbi, name: 'EscrowRefunded' },
  { key: 'CompletionRecorded', abi: reputationAbi, name: 'CompletionRecorded' },
];

function resolveEvent(spec: EventSpec): AbiEvent | null {
  try {
    return eventByName(spec.abi, spec.name);
  } catch {
    logger.warn(
      { spec: spec.key },
      'event backfill: event missing from ABI, skipping its scan',
    );
    return null;
  }
}

interface LogRow {
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: `0x${string}` | null;
}

async function scanOneChunk(
  address: `0x${string}`,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<LogRow[]> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < SCAN_CHUNK_RETRIES; attempt++) {
    try {
      const logs = await publicClient.getLogs({
        address,
        event,
        fromBlock,
        toBlock,
      });
      return logs.map((l) => ({
        args: ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) as Record<
          string,
          unknown
        >,
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: l.transactionHash ?? null,
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
      address,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
    },
    'event backfill chunk failed after retries; continuing without it',
  );
  return [];
}

async function scanLogs(
  address: `0x${string}` | null,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<LogRow[]> {
  if (!address || fromBlock > toBlock) return [];
  const windows: Array<{ from: bigint; to: bigint }> = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + SCAN_CHUNK_BLOCKS - 1n;
    const windowEnd = end > toBlock ? toBlock : end;
    windows.push({ from: cursor, to: windowEnd });
    cursor = windowEnd + 1n;
  }
  const out: LogRow[] = [];
  for (let i = 0; i < windows.length; i += SCAN_CONCURRENCY) {
    const batch = windows.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(
      batch.map((w) => scanOneChunk(address, event, w.from, w.to)),
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

async function timestampsFor(blocks: Iterable<bigint>): Promise<Map<string, number>> {
  const unique = new Set<string>();
  for (const b of blocks) unique.add(b.toString());
  const out = new Map<string, number>();
  await Promise.all(
    Array.from(unique).map(async (key) => {
      try {
        const block = await publicClient.getBlock({ blockNumber: BigInt(key) });
        out.set(key, Number(block.timestamp) * 1000);
      } catch {
        /* skip; events on this block drop out of the replay */
      }
    }),
  );
  return out;
}

function asBigint(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

interface MappedEvent {
  type: KarwanEventType;
  jobId?: string;
  actor: KarwanEvent['actor'];
  payload: Record<string, unknown>;
}

function mapJobPosted(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'job.posted',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: asString(row.args.buyer),
      budgetUsdc: formatUnits(asBigint(row.args.budget), USDC_DECIMALS),
      deadlineUnix: Number(asBigint(row.args.deadline)),
      termsHash: asString(row.args.termsHash),
    },
  };
}

function mapBidSubmitted(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'bid.submitted',
    jobId,
    actor: 'seller',
    payload: {
      seller: asString(row.args.seller),
      priceUsdc: formatUnits(asBigint(row.args.price), USDC_DECIMALS),
      deadlineUnix: Number(asBigint(row.args.deadline)),
    },
  };
}

function mapBidAccepted(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'bid.accepted',
    jobId,
    actor: 'buyer',
    payload: {
      seller: asString(row.args.seller),
      agreedPriceUsdc: formatUnits(asBigint(row.args.price), USDC_DECIMALS),
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapEscrowFunded(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'escrow.funded',
    jobId,
    actor: 'buyer',
    payload: {
      buyer: asString(row.args.buyer),
      seller: asString(row.args.seller),
      dealAmountUsdc: formatUnits(asBigint(row.args.dealAmount), USDC_DECIMALS),
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapProgressReleased(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'escrow.milestone.released',
    jobId,
    actor: 'buyer',
    payload: {
      milestoneIndex: Number(asBigint(row.args.milestoneIndex)),
      amountUsdc: formatUnits(asBigint(row.args.amount), USDC_DECIMALS),
      seller: asString(row.args.seller),
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapEscrowSettled(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'escrow.settled',
    jobId,
    actor: 'buyer',
    payload: {
      sellerTotalWei: asBigint(row.args.sellerTotal).toString(),
      feeTotalWei: asBigint(row.args.feeTotal).toString(),
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapEscrowDisputed(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'deal.disputed',
    jobId,
    actor: 'buyer',
    payload: {
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapEscrowRefunded(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  return {
    type: 'deal.cancelled',
    jobId,
    actor: 'buyer',
    payload: {
      kind: 'unilateral',
      amountUsdc: formatUnits(asBigint(row.args.amount), USDC_DECIMALS),
      priorReleasedUsdc: formatUnits(asBigint(row.args.priorReleased), USDC_DECIMALS),
      txHash: row.transactionHash ?? undefined,
    },
  };
}

function mapRepCompletion(row: LogRow): MappedEvent | null {
  const jobId = asString(row.args.jobId);
  if (!jobId) return null;
  const outcomeRaw = Number(asBigint(row.args.outcome));
  const label = outcomeRaw === 1 ? 'success' : outcomeRaw === 2 ? 'dispute' : 'failed';
  return {
    type: 'reputation.recorded',
    jobId,
    actor: 'buyer',
    payload: {
      subject: asString(row.args.seller),
      rater: asString(row.args.buyer),
      outcome: label,
      txHash: row.transactionHash ?? undefined,
    },
  };
}

interface ScanGroup {
  rows: LogRow[];
  map: (row: LogRow) => MappedEvent | null;
}

export async function backfillBusFromChain(
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; injected: number }> {
  /// If the bus is already well-populated (disk snapshot loaded a prior
  /// history), skip the chain replay — it's RPC traffic with no payoff. But
  /// don't gate on >0 alone: a partial backfill from a previous boot could
  /// leave a handful of events that pass the >0 check yet are missing most
  /// of the history. 50 is the threshold below which we re-scan; pass
  /// `force: true` to bypass (admin endpoint, post-redeploy).
  const MIN_HEALTHY_HISTORY = 50;
  if (!opts.force && bus.historyLength() >= MIN_HEALTHY_HISTORY) {
    logger.info(
      { existing: bus.historyLength() },
      'event backfill: bus history looks healthy; skipping chain replay',
    );
    return { scanned: 0, injected: 0 };
  }
  const head = await publicClient.getBlockNumber();
  const deployBlock = config.KARWAN_VAULT_DEPLOY_BLOCK
    ? BigInt(config.KARWAN_VAULT_DEPLOY_BLOCK)
    : 0n;
  const lowerBound = deployBlock < 0n ? 0n : deployBlock;

  const escrowAddr = (config.KARWAN_ESCROW_ADDR ?? null) as `0x${string}` | null;
  const jobBoardAddr = (config.KARWAN_JOBBOARD_ADDR ?? null) as `0x${string}` | null;
  const repAddr = (config.KARWAN_REPUTATION_ADDR ?? null) as `0x${string}` | null;

  logger.info(
    {
      force: !!opts.force,
      existingHistory: bus.historyLength(),
      head: head.toString(),
      lowerBound: lowerBound.toString(),
      escrowAddr,
      jobBoardAddr,
      repAddr,
    },
    'event backfill: starting chain replay',
  );

  /// Resolve each event once. A null result means the ABI doesn't have it
  /// (logged in resolveEvent); the corresponding scan is skipped and the
  /// rest still run. This is what stops a renamed event from crashing boot.
  const evJobPosted = resolveEvent(EVENT_SPECS[0]!);
  const evBidSubmitted = resolveEvent(EVENT_SPECS[1]!);
  const evBidAccepted = resolveEvent(EVENT_SPECS[2]!);
  const evEscrowFunded = resolveEvent(EVENT_SPECS[3]!);
  const evProgressReleased = resolveEvent(EVENT_SPECS[4]!);
  const evEscrowSettled = resolveEvent(EVENT_SPECS[5]!);
  const evEscrowDisputed = resolveEvent(EVENT_SPECS[6]!);
  const evEscrowRefunded = resolveEvent(EVENT_SPECS[7]!);
  const evRepCompletion = resolveEvent(EVENT_SPECS[8]!);

  async function scanIf(
    addr: `0x${string}` | null,
    event: AbiEvent | null,
  ): Promise<LogRow[]> {
    if (!event) return [];
    return scanLogs(addr, event, lowerBound, head);
  }

  const [
    jobPosted,
    bidSubmitted,
    bidAccepted,
    escrowFunded,
    progressReleased,
    escrowSettled,
    escrowDisputed,
    escrowRefunded,
    repCompletion,
  ] = await Promise.all([
    scanIf(jobBoardAddr, evJobPosted),
    scanIf(jobBoardAddr, evBidSubmitted),
    scanIf(jobBoardAddr, evBidAccepted),
    scanIf(escrowAddr, evEscrowFunded),
    scanIf(escrowAddr, evProgressReleased),
    scanIf(escrowAddr, evEscrowSettled),
    scanIf(escrowAddr, evEscrowDisputed),
    scanIf(escrowAddr, evEscrowRefunded),
    scanIf(repAddr, evRepCompletion),
  ]);

  const groups: ScanGroup[] = [
    { rows: jobPosted, map: mapJobPosted },
    { rows: bidSubmitted, map: mapBidSubmitted },
    { rows: bidAccepted, map: mapBidAccepted },
    { rows: escrowFunded, map: mapEscrowFunded },
    { rows: progressReleased, map: mapProgressReleased },
    { rows: escrowSettled, map: mapEscrowSettled },
    { rows: escrowDisputed, map: mapEscrowDisputed },
    { rows: escrowRefunded, map: mapEscrowRefunded },
    { rows: repCompletion, map: mapRepCompletion },
  ];

  const totalRows = groups.reduce((n, g) => n + g.rows.length, 0);
  if (totalRows === 0) {
    logger.info('event backfill: no chain events found');
    return { scanned: 0, injected: 0 };
  }

  const blocks = new Set<bigint>();
  for (const g of groups) {
    for (const r of g.rows) blocks.add(r.blockNumber);
  }
  const timeByBlock = await timestampsFor(blocks);

  const events: KarwanEvent[] = [];
  for (const g of groups) {
    for (const row of g.rows) {
      const ts = timeByBlock.get(row.blockNumber.toString());
      if (!ts) continue;
      const mapped = g.map(row);
      if (!mapped) continue;
      events.push({ ...mapped, ts });
    }
  }
  /// Sort ascending by timestamp so the chronology is right when the bus
  /// applies its own sort. Then trim to the bus capacity, keeping the most
  /// recent so an older deploy with thousands of events still surfaces what
  /// matters.
  events.sort((a, b) => a.ts - b.ts);
  const trimmed =
    events.length > HISTORY_CAPACITY ? events.slice(-HISTORY_CAPACITY) : events;

  const injected = bus.injectHistorical(trimmed);
  logger.info(
    { scanned: totalRows, mapped: events.length, injected },
    'event backfill: chain replay complete',
  );
  return { scanned: totalRows, injected };
}
