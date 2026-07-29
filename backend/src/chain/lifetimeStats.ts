import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, decodeEventLog, fallback, formatUnits, http } from 'viem';
import { eq } from 'drizzle-orm';
import { arcTestnet, publicClient, RPC_URLS, type PublicClient } from './client.js';
import { escrowAbi } from './abis/escrow.js';
import { escrowV2Abi } from './abis/escrowV2.js';
import { vaultAbi } from './abis/vault.js';
import { vaultV2Abi } from './abis/vaultV2.js';
import { historicalEventsAbi } from './abis/historicalEvents.js';
import { DEPLOY_LEDGER, type DeployedContract } from './deployLedger.js';
import { logger } from '../logger.js';
import { db, pgEnabled } from '../db/client.js';
import { appSnapshots } from '../db/schema.js';

/// All-time totals across every contract Karwan has ever deployed.
///
/// `networkStats` deliberately covers only the contracts in the current env, so
/// its numbers reset to zero on every redeploy. That is right for a "what is
/// live now" band and wrong for "what has this platform ever done", which is
/// what this answers. The two are separate on purpose: neither can quietly
/// become the other.
///
/// Two things make the number trustworthy rather than merely large:
///
///  1. The contract list is GENERATED from contracts/broadcast (see
///     deployLedger.ts), not hand-kept, so a retired generation cannot be
///     forgotten out of the total.
///  2. Logs are fetched UNFILTERED per address and decoded here, rather than
///     fetched with an event filter. A filtered scan asks the chain for one
///     known signature, so a generation whose EscrowFunded had a different
///     shape returns zero and reads exactly like a generation nobody used.
///     Decoding locally means anything we cannot decode is COUNTED and
///     reported as `undecodedEvents` instead of silently vanishing.

const SNAPSHOT_KEY = 'lifetime_stats_v1';
/// Overridable so a test can point at its own file instead of inheriting the
/// real snapshot, which on a developer machine holds a part-finished sweep.
const STATE_PATH =
  process.env.LIFETIME_STORE_PATH ?? resolve(process.cwd(), 'data', 'lifetimeStats.json');

const USDC_DECIMALS = 6;

/// Arc's public RPC accepts a 5,000-block getLogs window and rejects 50,000
/// with "request limit reached", so 5k is the measured ceiling rather than a
/// guess. Overridable because a dedicated node (Canteen) allows far wider
/// windows, and the whole sweep is bounded by how many windows it takes.
///
/// Do NOT raise this against an endpoint you have not measured. Arc returns an
/// EMPTY ARRAY rather than an error for some over-wide windows, and an empty
/// array is indistinguishable from a window that genuinely had no activity, so
/// guessing high does not fail loudly. It just quietly loses money from the
/// total.
const CHUNK_BLOCKS = BigInt(process.env.LIFETIME_SCAN_CHUNK_BLOCKS ?? 5_000);
/// Four rather than eight: at eight the public RPC starts answering "request
/// limit reached", which costs more in backoff than the parallelism wins.
const CONCURRENCY = Number(process.env.LIFETIME_SCAN_CONCURRENCY ?? 4);
const CHUNK_RETRIES = 6;
const CHUNK_BACKOFF_MS = 500;
/// How often the cursor is written out mid-sweep. The first sweep is thousands
/// of windows; without this a failure near the end throws away all of it.
const PERSIST_EVERY_BATCHES = 20;

/// Every escrow and vault ABI across generations, unioned, plus every event
/// signature the sources have ever declared (recovered from git history by
/// scripts/gen-historical-events.mjs).
///
/// The current ABIs alone are not enough. `EscrowFunded` has existed in three
/// different shapes and `EscrowSettled` in two; the retired contracts that
/// emitted the older shapes are still deployed and their logs are still on
/// chain. Decoding those against today's ABI fails, and the money they moved
/// would be missing from an "all time" figure.
///
/// `decodeEventLog` selects by topic0, and each shape hashes to its own topic0,
/// so listing several versions of one event name is unambiguous rather than a
/// conflict.
const DECODE_ABI = [
  ...escrowV2Abi,
  ...escrowAbi,
  ...vaultV2Abi,
  ...vaultAbi,
  ...historicalEventsAbi,
] as const;

export interface ContractLifetime {
  name: string;
  address: string;
  deployBlock: string;
  /// Last block folded in. Below this the history is immutable and never
  /// rescanned, which is what keeps the refresh cheap after the first seed.
  scannedTo: string;
  events: number;
  undecodedEvents: number;
  deals: number;
  fundedUsdc: string;
  releasedUsdc: string;
  settledUsdc: string;
  refundedUsdc: string;
  feesUsdc: string;
  firstActivityBlock: string | null;
  lastActivityBlock: string | null;
}

export interface LifetimeStats {
  /// Earliest deploy block across the whole ledger: literally day one.
  fromBlock: string;
  toBlock: string;
  totals: {
    contracts: number;
    /// Contracts that ever emitted anything. The rest were deployed and
    /// superseded before anyone touched them, and saying so is more honest
    /// than quietly dropping them from the list.
    contractsWithActivity: number;
    transactions: number;
    events: number;
    undecodedEvents: number;
    deals: number;
  };
  volumes: {
    fundedUsdc: string;
    releasedUsdc: string;
    settledUsdc: string;
    refundedUsdc: string;
    feesUsdc: string;
  };
  contracts: ContractLifetime[];
  scannedAt: number;
}

export interface Acc {
  /// ONE cursor for the whole ledger, not one per contract.
  ///
  /// Every window asks for all contracts at once, so a block is scanned exactly
  /// once across the entire platform. That is what makes the transaction count
  /// exact: a single transaction that touches two contracts (funding an escrow
  /// that pulls stake from the vault) appears in one block, therefore in one
  /// window, and dedupes to one. Per-contract cursors would let the same
  /// transaction be seen in two separate passes and counted twice.
  cursor: string;
  perContract: Record<string, ContractLifetime>;
  transactions: number;
  scannedAt: number;
}

let cached: { value: LifetimeStats; builtAt: number } | null = null;
let accumulator: Acc | null = null;

/// Exported for tests: a zeroed row is the starting point every fold assertion
/// builds on.
export function emptyContract(c: DeployedContract): ContractLifetime {
  return {
    name: c.name,
    address: c.address,
    deployBlock: c.deployBlock.toString(),
    scannedTo: (c.deployBlock - 1n).toString(),
    events: 0,
    undecodedEvents: 0,
    deals: 0,
    fundedUsdc: '0',
    releasedUsdc: '0',
    settledUsdc: '0',
    refundedUsdc: '0',
    feesUsdc: '0',
    firstActivityBlock: null,
    lastActivityBlock: null,
  };
}

function asBigint(v: unknown): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.trunc(v));
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/// Which event contributes to which running total.
///
/// Split by what the money DID, not by which generation emitted it, so a
/// renamed event on a later contract lands in the same bucket as the thing it
/// replaced. `MilestoneClaimed` and `ProgressReleased` are the same movement
/// under two names; so are `EscrowSettled` and `EscrowReleasedFromDispute`.
/// Exported for lifetimeStats.test.ts. The bucketing is where a wrong answer
/// would be least visible: every total would still add up, just to the wrong
/// thing, so it is worth testing directly rather than through a chain read.
export function fold(
  row: ContractLifetime,
  eventName: string,
  args: Record<string, unknown>,
): void {
  const add = (key: keyof ContractLifetime, amount: bigint) => {
    (row[key] as string) = (BigInt(row[key] as string) + amount).toString();
  };

  /// First of several field names that is actually present.
  ///
  /// The same event has carried different parameter names across generations:
  /// the first EscrowFunded called the trade value `amount`, later ones renamed
  /// it `dealAmount` and added `fundedAmount` beside it. Reading only the
  /// current name decodes the old log successfully and then records zero, which
  /// is the worst kind of wrong: it looks like a generation nobody used.
  const first = (...names: string[]): bigint => {
    for (const n of names) {
      if (args[n] !== undefined) return asBigint(args[n]);
    }
    return 0n;
  };

  switch (eventName) {
    case 'EscrowFunded':
      row.deals += 1;
      // dealAmount is the trade value; fundedAmount includes the fee the buyer
      // also transfers, so it would overstate volume. `amount` is the oldest
      // generation's name for the trade value.
      add('fundedUsdc', first('dealAmount', 'amount'));
      break;
    case 'ProgressReleased':
    case 'MilestoneClaimed':
      // Deliberately NOT the vault's `Released`, which sounds like the same
      // thing and is not: that is a seller's own stake being unlocked back to
      // them, not deal money being paid out. Counting it here would inflate
      // "released" with money that never changed hands.
      add('releasedUsdc', first('amount'));
      break;
    case 'EscrowSettled':
    case 'EscrowReleasedFromDispute':
      // finalAmount is the first generation's name for sellerTotal.
      add('settledUsdc', first('sellerTotal', 'finalAmount'));
      break;
    case 'DisputeResolved':
    case 'MutualCancelled':
      add('settledUsdc', asBigint(args.sellerCut));
      add('refundedUsdc', asBigint(args.buyerCut));
      break;
    case 'EscrowRefunded':
    case 'DeadlineReclaimed':
      add('refundedUsdc', first('amount'));
      break;
    case 'FeeCollected':
      add('feesUsdc', first('amount'));
      break;
    default:
      // Decoded but not a money movement (ownership, config, timing). Counted
      // in `events`, contributes nothing to volume. Not undecoded.
      break;
  }
}

interface RawLog {
  address: string;
  blockNumber: bigint;
  transactionHash: string | null;
  topics: readonly string[];
  data: string;
}

const ALL_ADDRESSES = DEPLOY_LEDGER.map((c) => c.address);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unparseable-rpc-url';
  }
}

/// A client built only from endpoints that can actually serve this scan's
/// window, decided by measurement.
///
/// The shared `publicClient` fans out over every configured endpoint, which is
/// right for normal reads and wrong here. Providers cap the getLogs block range
/// by plan (Alchemy's free tier allows TEN blocks), and a capped endpoint in a
/// `fallback` pool does not degrade the sweep, it kills it: when the primary
/// rate-limits under load, every retry lands on the capped one and fails, so
/// the window exhausts its retries and the whole run aborts. That is exactly
/// how the first full sweep died at block 46,059,432.
///
/// So probe each endpoint once with a real request at the real width, keep the
/// ones that answer, and say in the log which were dropped and why. Measured,
/// not hardcoded: a plan upgrade or a new endpoint changes the answer, and
/// nobody should have to remember to edit a list.
let scanClient: PublicClient | null = null;

async function resolveScanClient(
  onProgress?: (msg: string) => void,
): Promise<{ client: PublicClient; endpoints: number }> {
  if (scanClient) return { client: scanClient, endpoints: capableCount };

  const capable: string[] = [];
  const head = await publicClient.getBlockNumber();
  const from = head > CHUNK_BLOCKS ? head - CHUNK_BLOCKS : 0n;

  for (const url of RPC_URLS) {
    const probe = createPublicClient({
      chain: arcTestnet,
      transport: http(url, { retryCount: 0, timeout: 20_000 }),
    });
    try {
      await probe.getLogs({ address: [...ALL_ADDRESSES], fromBlock: from, toBlock: head });
      capable.push(url);
      onProgress?.(`rpc ${hostOf(url)}: serves ${CHUNK_BLOCKS}-block windows`);
    } catch (err) {
      const detail = /Details: ([^\n]*)/.exec((err as Error).message)?.[1] ?? 'request failed';
      onProgress?.(`rpc ${hostOf(url)}: SKIPPED, ${detail.slice(0, 100)}`);
    }
  }

  if (capable.length === 0) {
    throw new Error(
      `no configured Arc RPC can serve a ${CHUNK_BLOCKS}-block getLogs window ` +
        `(tried ${RPC_URLS.map(hostOf).join(', ')}). Lower ` +
        `LIFETIME_SCAN_CHUNK_BLOCKS or configure an endpoint with a wider range.`,
    );
  }

  const transports = capable.map((url) => http(url, { retryCount: 1, timeout: 30_000 }));
  scanClient = createPublicClient({
    chain: arcTestnet,
    transport:
      transports.length === 1
        ? transports[0]!
        : fallback(transports, { rank: false, retryCount: 0, shouldThrow: () => false }),
  }) as PublicClient;
  capableCount = capable.length;
  return { client: scanClient, endpoints: capableCount };
}

let capableCount = 0;

/// Day one: the oldest deploy in the ledger. Where every sweep starts, and what
/// the page means by "since day one".
const EARLIEST_DEPLOY = DEPLOY_LEDGER.reduce(
  (min, c) => (c.deployBlock < min ? c.deployBlock : min),
  DEPLOY_LEDGER[0]?.deployBlock ?? 0n,
);

/// One window, every contract. Retries with exponential backoff, because the
/// public RPC answers "request limit reached" under load and that is a wait,
/// not a verdict.
async function scanWindow(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt += 1) {
    try {
      // One request covering every contract. `eth_getLogs` takes an address
      // array and Arc honours it, so a window costs one call rather than one
      // per contract.
      const logs = await client.getLogs({ address: [...ALL_ADDRESSES], fromBlock, toBlock });
      return logs.map((l) => ({
        address: l.address.toLowerCase(),
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: l.transactionHash ?? null,
        topics: l.topics as readonly string[],
        data: l.data,
      }));
    } catch (err) {
      lastErr = err as Error;
      if (attempt < CHUNK_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, CHUNK_BACKOFF_MS * 2 ** attempt));
      }
    }
  }
  // Thrown, never swallowed to an empty array. An empty array here would be
  // indistinguishable from "this window really had nothing", and would
  // permanently under-report the total once the cursor moved past it.
  throw lastErr ?? new Error(`lifetime scan failed for window ${fromBlock}-${toBlock}`);
}

/// Exported for tests. This is where base units become decimal USDC, so it is
/// where a formatting mismatch between the totals and the breakdown would
/// appear.
export function projectFromAcc(acc: Acc, head: bigint): LifetimeStats {
  const rows = DEPLOY_LEDGER.map((c) => acc.perContract[c.address]).filter(
    (c): c is ContractLifetime => !!c,
  );

  const sum = (key: keyof ContractLifetime) =>
    rows.reduce((t, c) => t + BigInt(c[key] as string), 0n).toString();

  // The accumulator holds base units so the running sums stay exact. Everything
  // that leaves this function is decimal USDC, including the per-contract rows:
  // an API where the totals are formatted and the breakdown beside them is not
  // is an API whose breakdown gets rendered a million times too large.
  const contracts: ContractLifetime[] = rows.map((c) => ({
    ...c,
    fundedUsdc: formatUnits(BigInt(c.fundedUsdc), USDC_DECIMALS),
    releasedUsdc: formatUnits(BigInt(c.releasedUsdc), USDC_DECIMALS),
    settledUsdc: formatUnits(BigInt(c.settledUsdc), USDC_DECIMALS),
    refundedUsdc: formatUnits(BigInt(c.refundedUsdc), USDC_DECIMALS),
    feesUsdc: formatUnits(BigInt(c.feesUsdc), USDC_DECIMALS),
  }));

  return {
    fromBlock: EARLIEST_DEPLOY.toString(),
    toBlock: head.toString(),
    totals: {
      contracts: contracts.length,
      contractsWithActivity: contracts.filter((c) => c.events > 0).length,
      transactions: acc.transactions,
      events: contracts.reduce((t, c) => t + c.events, 0),
      undecodedEvents: contracts.reduce((t, c) => t + c.undecodedEvents, 0),
      deals: contracts.reduce((t, c) => t + c.deals, 0),
    },
    volumes: {
      fundedUsdc: formatUnits(BigInt(sum('fundedUsdc')), USDC_DECIMALS),
      releasedUsdc: formatUnits(BigInt(sum('releasedUsdc')), USDC_DECIMALS),
      settledUsdc: formatUnits(BigInt(sum('settledUsdc')), USDC_DECIMALS),
      refundedUsdc: formatUnits(BigInt(sum('refundedUsdc')), USDC_DECIMALS),
      feesUsdc: formatUnits(BigInt(sum('feesUsdc')), USDC_DECIMALS),
    },
    contracts,
    scannedAt: acc.scannedAt,
  };
}

/// Sweep from the stored cursor to head, folding every log into the totals.
///
/// Resumable by design. The first sweep covers roughly 12 million blocks and
/// the cursor is written out every few hundred windows, so an interrupted run
/// picks up near where it stopped instead of starting over. Everything below
/// the cursor is finalised history and is never read again.
export async function rebuildLifetimeStats(
  onProgress?: (msg: string) => void,
): Promise<LifetimeStats> {
  // Load the stored cursor BEFORE deciding where to start.
  //
  // Without this the sweep is only resumable inside one process: a fresh one
  // has `accumulator === null`, so it silently restarts from day one and
  // overwrites the snapshot with a partial. That is what happened on the first
  // two attempts at the full seed, and it is invisible unless you watch the
  // starting block, because the result looks like a scan that is simply slow.
  await hydrate();
  const { client, endpoints } = await resolveScanClient(onProgress);
  // With one usable endpoint there is nothing to rotate to, so a rate-limit is
  // a stall rather than a detour, and the parallelism is halved.
  //
  // Measured, and the honest result is that it barely matters: against Arc's
  // public RPC, 2 and 6 concurrent windows moved through a busy stretch at
  // about the same rate. The endpoint is the bottleneck, not the client, so the
  // lower number is preferred for being gentler rather than for being faster.
  // LIFETIME_SCAN_CONCURRENCY is the knob if a dedicated node changes that.
  const concurrency = endpoints > 1 ? CONCURRENCY : Math.max(2, Math.floor(CONCURRENCY / 2));
  const head = await client.getBlockNumber();

  const acc: Acc = accumulator ?? {
    cursor: (EARLIEST_DEPLOY - 1n).toString(),
    perContract: {},
    transactions: 0,
    scannedAt: 0,
  };
  for (const c of DEPLOY_LEDGER) {
    if (!acc.perContract[c.address]) acc.perContract[c.address] = emptyContract(c);
  }
  accumulator = acc;

  const start = BigInt(acc.cursor) + 1n;
  if (start > head) {
    acc.scannedAt = Date.now();
    const upToDate = projectFromAcc(acc, head);
    cached = { value: upToDate, builtAt: Date.now() };
    return upToDate;
  }

  const windows: Array<{ from: bigint; to: bigint }> = [];
  for (let cursor = start; cursor <= head; ) {
    const end = cursor + CHUNK_BLOCKS - 1n;
    const to = end > head ? head : end;
    windows.push({ from: cursor, to });
    cursor = to + 1n;
  }
  onProgress?.(`blocks ${start}..${head} in ${windows.length} windows of ${CHUNK_BLOCKS}`);

  for (let i = 0; i < windows.length; i += concurrency) {
    const batch = windows.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((w) => scanWindow(client, w.from, w.to)));

    for (const logs of results) {
      // Per window, not per contract: a transaction lives in exactly one block
      // and therefore one window, so this dedupes it exactly once no matter how
      // many Karwan contracts it touched.
      const txHashes = new Set<string>();
      for (const log of logs) {
        const row = acc.perContract[log.address];
        if (!row) continue; // an address outside the ledger; cannot happen, but not ours to count
        row.events += 1;
        if (log.transactionHash) txHashes.add(log.transactionHash.toLowerCase());
        const blk = log.blockNumber.toString();
        if (!row.firstActivityBlock) row.firstActivityBlock = blk;
        row.lastActivityBlock = blk;
        try {
          const decoded = decodeEventLog({
            abi: DECODE_ABI,
            data: log.data as `0x${string}`,
            topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]],
          });
          fold(row, decoded.eventName as string, (decoded.args ?? {}) as Record<string, unknown>);
        } catch {
          // A signature from a generation whose ABI is no longer in the repo.
          // Counted, reported, and excluded from volume: a number we cannot
          // decode is a number we must not add up.
          row.undecodedEvents += 1;
        }
      }
      acc.transactions += txHashes.size;
    }

    // Advanced only after the whole batch resolved. A thrown window rejects the
    // Promise.all and leaves the cursor where it was, so the next run retries
    // that range rather than stepping over a hole in the history.
    const batchEnd = batch[batch.length - 1]!.to;
    acc.cursor = batchEnd.toString();
    for (const c of DEPLOY_LEDGER) {
      const row = acc.perContract[c.address]!;
      if (batchEnd >= c.deployBlock) row.scannedTo = batchEnd.toString();
    }

    const batchIndex = i / concurrency;
    if (batchIndex > 0 && batchIndex % PERSIST_EVERY_BATCHES === 0) {
      acc.scannedAt = Date.now();
      const partial = projectFromAcc(acc, batchEnd);
      cached = { value: partial, builtAt: Date.now() };
      persist({ acc, snapshot: cached });
      onProgress?.(
        `  ${Math.min(i + concurrency, windows.length)}/${windows.length} windows, block ${batchEnd}, ${acc.transactions} txns`,
      );
    }
  }

  acc.scannedAt = Date.now();
  const value = projectFromAcc(acc, head);
  cached = { value, builtAt: Date.now() };
  persist({ acc, snapshot: cached });
  return value;
}

interface Persisted {
  acc: Acc;
  snapshot: { value: LifetimeStats; builtAt: number };
}

function persist(p: Persisted): void {
  try {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify(p), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'lifetime stats: disk persist failed');
  }
  if (pgEnabled) {
    const now = Date.now();
    void db()
      .insert(appSnapshots)
      .values({ key: SNAPSHOT_KEY, data: p, updatedAt: now })
      .onConflictDoUpdate({ target: appSnapshots.key, set: { data: p, updatedAt: now } })
      .catch(() => {
        /* disk + memory keep serving */
      });
  }
}

function adopt(p: Persisted | undefined): boolean {
  if (!p?.acc || !p.snapshot?.value) return false;
  accumulator = p.acc;
  cached = p.snapshot;
  return true;
}

/// Load the last seed from disk, then Postgres. The seed is expensive enough
/// (a full sweep of ~87M blocks the first time) that a boot must never trigger
/// it implicitly: without a snapshot the route reports "not scanned yet" and
/// the ops script is what produces one.
let hydrated = false;
async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    if (existsSync(STATE_PATH)) {
      if (adopt(JSON.parse(readFileSync(STATE_PATH, 'utf8')) as Persisted)) {
        logger.info({ scannedAt: cached?.value.scannedAt }, 'lifetime stats: hydrated from disk');
        return;
      }
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'lifetime stats: disk hydrate failed');
  }
  if (!pgEnabled) return;
  try {
    const rows = await db().select().from(appSnapshots).where(eq(appSnapshots.key, SNAPSHOT_KEY));
    if (adopt(rows[0]?.data as Persisted | undefined)) {
      logger.info({ scannedAt: cached?.value.scannedAt }, 'lifetime stats: hydrated from postgres');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'lifetime stats: pg hydrate failed');
  }
}

/// Serve-TTL for the snapshot. Everything below the cursor is immutable, so a
/// stale read is only ever missing the newest blocks, never wrong about the
/// old ones.
const REFRESH_AFTER_MS = 15 * 60_000;
let refreshing = false;

export async function getLifetimeStats(): Promise<LifetimeStats | null> {
  await hydrate();
  if (!cached) return null;

  if (!refreshing && Date.now() - cached.builtAt > REFRESH_AFTER_MS) {
    refreshing = true;
    void rebuildLifetimeStats()
      .catch((err) =>
        logger.warn({ err: (err as Error).message }, 'lifetime stats refresh failed'),
      )
      .finally(() => {
        refreshing = false;
      });
  }
  return cached.value;
}

/// Test seam. Resets module state so a suite can drive the accumulator without
/// inheriting another test's snapshot. Hydration stays disabled unless a test
/// asks for it, so no test can accidentally read the real sweep off disk.
export function __resetLifetimeStatsForTest(options?: { allowHydrate?: boolean }): void {
  cached = null;
  accumulator = null;
  hydrated = !options?.allowHydrate;
}

/// The block the next sweep would resume from, or null if nothing is loaded.
/// Exported so a test can prove a fresh process picks up the stored cursor
/// rather than restarting from day one.
export async function __resumePointForTest(): Promise<string | null> {
  await hydrate();
  return accumulator?.cursor ?? null;
}

export function __setLifetimeStatsForTest(p: Persisted): void {
  adopt(p);
  hydrated = true;
}
