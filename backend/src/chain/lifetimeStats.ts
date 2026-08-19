import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createPublicClient, decodeEventLog, fallback, formatUnits, http } from 'viem';
import { eq } from 'drizzle-orm';
import { arcTestnet, publicClient, RPC_URLS, type PublicClient } from './client.js';
import { escrowAbi } from './abis/escrow.js';
import { escrowV2Abi } from './abis/escrowV2.js';
import { vaultAbi } from './abis/vault.js';
import { vaultV2Abi } from './abis/vaultV2.js';
import { invoiceRegistryV2Abi } from './abis/invoiceRegistryV2.js';
import { poFinancingV2Abi } from './abis/poFinancingV2.js';
import { legacyPoFinancingAbi } from './abis/legacyPoFinancing.js';
import { treasuryV2Abi } from './abis/treasuryV2.js';
import { yieldDistributorV2Abi } from './abis/yieldDistributorV2.js';
import { jobBoardV2Abi } from './abis/jobBoardV2.js';
import { reputationV2Abi } from './abis/reputationV2.js';
import { businessRegistryV2Abi } from './abis/businessRegistryV2.js';
import { historicalEventsAbi } from './abis/historicalEvents.js';
import {
  DEPLOY_LEDGER,
  type ContractKind,
  type DeployedContract,
} from './deployLedger.js';
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

/// Versioned, and the version is part of the contract with whoever runs the
/// scan. v1 covered escrow and vault only. v2 covers every Karwan contract ever
/// deployed, which means v1's accumulator has no rows for two thirds of the
/// ledger and its cursor already sits at head, so resuming from it would leave
/// the new contracts reading zero forever. Bumping the key forces one full
/// re-sweep rather than a silent under-count.
const SNAPSHOT_KEY = 'lifetime_stats_v2';
/// Overridable so a test can point at its own file instead of inheriting the
/// real snapshot, which on a developer machine holds a part-finished sweep.
const STATE_PATH =
  process.env.LIFETIME_STORE_PATH ?? resolve(process.cwd(), 'data', 'lifetimeStats.json');

const USDC_DECIMALS = 6;

/// Arc's public RPC constrains a getLogs filter on TWO axes, and it reports
/// both with the same message, "requested range too large". Measured
/// 2026-08-19 against rpc.testnet.arc.network:
///
///   addresses per filter   20 works, 22 fails, at any width
///   blocks per window      30,000 works, 40,000 fails, at 16 addresses
///
/// The address cap is the one that bites, and it stayed invisible for a year
/// because the ledger held 18 addresses, two under the limit. Widening the
/// ledger to 55 made every single request fail, including a 500-block window,
/// while the error still blamed the range. Hence ADDRESS_BATCH below.
///
/// Do NOT raise either number against an endpoint you have not measured, and
/// do not measure against a quiet stretch of chain. Arc has returned an EMPTY
/// ARRAY rather than an error for some over-wide windows, and an empty array is
/// indistinguishable from a window that genuinely had no activity, so guessing
/// high does not fail loudly. It just quietly loses money from the total. The
/// probe that means anything compares a wide request against a narrow one over
/// a range known to contain logs.
const CHUNK_BLOCKS = BigInt(process.env.LIFETIME_SCAN_CHUNK_BLOCKS ?? 20_000);
/// Addresses per getLogs call. Sixteen, four under the measured cap of twenty,
/// so a ledger that grows by a deploy or two does not start failing.
const ADDRESS_BATCH = Number(process.env.LIFETIME_SCAN_ADDRESS_BATCH ?? 16);
/// Windows in flight. Address batches inside a window are sequential, so this
/// is also the request concurrency. Arc's public RPC serves about two at once.
const CONCURRENCY = Number(process.env.LIFETIME_SCAN_CONCURRENCY ?? 4);
/// Ten rather than six. Splitting the ledger into address batches multiplied
/// the request count roughly fourfold, which is enough to keep the public RPC's
/// rate limiter engaged for longer than six doublings of 500ms could ride out.
/// A sweep that aborts near the end still checkpoints, but it needs a human to
/// restart it, and the whole point of the retry ladder is that it does not.
const CHUNK_RETRIES = Number(process.env.LIFETIME_SCAN_RETRIES ?? 10);
const CHUNK_BACKOFF_MS = 500;
/// Rate limits get their own, longer ladder. 2s doubling reaches roughly a
/// minute of patience, which is what the public endpoint asks for under load.
const RATE_LIMIT_BACKOFF_MS = Number(process.env.LIFETIME_SCAN_RATE_BACKOFF_MS ?? 2_000);
/// What the OTHER in-flight windows wait when one of them is refused. Short on
/// purpose: they have not been refused, and braking everything for the full
/// backoff of one unlucky request is what made a resumed sweep crawl at 40
/// windows in five minutes.
const RATE_LIMIT_BRAKE_MS = Number(process.env.LIFETIME_SCAN_BRAKE_MS ?? 1_500);
/// Minimum gap between consecutive getLogs calls to the endpoint, across every
/// window. Measured by watching where the public RPC starts refusing: roughly
/// six requests a second is comfortable, so 160ms leaves margin.
const REQUEST_GAP_MS = Number(process.env.LIFETIME_SCAN_REQUEST_GAP_MS ?? 160);
/// How often the cursor is written out mid-sweep, in wall-clock milliseconds.
/// The first sweep is hundreds of windows against a ~2s-per-request endpoint;
/// without this a run that gets killed throws away everything since the last
/// save. Deliberately time-based rather than counted in batches, so changing
/// concurrency cannot silently stretch the interval.
const PERSIST_EVERY_MS = Number(process.env.LIFETIME_SCAN_PERSIST_MS ?? 30_000);

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
  ...invoiceRegistryV2Abi,
  ...poFinancingV2Abi,
  ...legacyPoFinancingAbi,
  ...treasuryV2Abi,
  ...yieldDistributorV2Abi,
  ...jobBoardV2Abi,
  ...reputationV2Abi,
  ...businessRegistryV2Abi,
  ...historicalEventsAbi,
] as const;

export interface ContractLifetime {
  name: string;
  kind: ContractKind;
  address: string;
  deployBlock: string;
  /// Last block folded in. Below this the history is immutable and never
  /// rescanned, which is what keeps the refresh cheap after the first seed.
  scannedTo: string;
  events: number;
  undecodedEvents: number;
  deals: number;
  /// Advances taken against an invoice or a purchase order.
  financings: number;
  /// Advances the borrower never repaid inside the window.
  defaults: number;
  /// Requests posted to the job board, whether or not they went anywhere.
  jobsPosted: number;
  fundedUsdc: string;
  releasedUsdc: string;
  settledUsdc: string;
  refundedUsdc: string;
  feesUsdc: string;
  /// Financier capital paid to a supplier ahead of settlement.
  advancedUsdc: string;
  /// Capital pulled back out of settlement to the financier.
  repaidUsdc: string;
  /// Seller stake taken by a counterparty: lost disputes, and collateral
  /// forfeited on a defaulted advance.
  slashedUsdc: string;
  /// Principal locked into the vault as deal insurance.
  stakedUsdc: string;
  /// Yield pulled to a staker's own wallet.
  yieldUsdc: string;
  firstActivityBlock: string | null;
  lastActivityBlock: string | null;
}

/// Money and counts, rolled up. Used for the whole-platform totals and again
/// per kind, so the page can say what settlement did and what financing did
/// without the reader summing a table in their head.
export interface LifetimeVolumes {
  fundedUsdc: string;
  releasedUsdc: string;
  settledUsdc: string;
  refundedUsdc: string;
  feesUsdc: string;
  advancedUsdc: string;
  repaidUsdc: string;
  slashedUsdc: string;
  stakedUsdc: string;
  yieldUsdc: string;
}

export interface KindRollup {
  kind: ContractKind;
  contracts: number;
  contractsWithActivity: number;
  events: number;
  deals: number;
  financings: number;
  defaults: number;
  jobsPosted: number;
  volumes: LifetimeVolumes;
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
    financings: number;
    defaults: number;
    jobsPosted: number;
  };
  volumes: LifetimeVolumes;
  /// One row per kind, in a fixed order, including kinds that moved nothing.
  byKind: KindRollup[];
  contracts: ContractLifetime[];
  scannedAt: number;
}

/// Fingerprint of the contract list this snapshot was built from.
///
/// The cursor is global and, once a seed finishes, it sits at head. Add a
/// contract to the ledger after that and the resume logic starts at head+1, so
/// the new contract's entire history is skipped and it reports zero forever.
/// Nothing about that looks broken from the outside: the page renders, the
/// totals are plausible, a whole rail is just missing.
///
/// So the snapshot carries the list it was built from, and a snapshot built
/// from a different list is refused rather than resumed. Refusing is a 503 and
/// a re-seed, which is loud. The alternative is a wrong number nobody catches.
export const LEDGER_FINGERPRINT = (() => {
  let hash = 7;
  for (const c of DEPLOY_LEDGER) {
    for (const ch of c.address) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `${DEPLOY_LEDGER.length}:${hash.toString(16)}`;
})();

export interface Acc {
  /// The ledger this accumulator was built against. See LEDGER_FINGERPRINT.
  ledgerFingerprint?: string;
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
    kind: c.kind,
    address: c.address,
    deployBlock: c.deployBlock.toString(),
    scannedTo: (c.deployBlock - 1n).toString(),
    events: 0,
    undecodedEvents: 0,
    deals: 0,
    financings: 0,
    defaults: 0,
    jobsPosted: 0,
    fundedUsdc: '0',
    releasedUsdc: '0',
    settledUsdc: '0',
    refundedUsdc: '0',
    feesUsdc: '0',
    advancedUsdc: '0',
    repaidUsdc: '0',
    slashedUsdc: '0',
    stakedUsdc: '0',
    yieldUsdc: '0',
    firstActivityBlock: null,
    lastActivityBlock: null,
  };
}

/// Every money field, in one place, so a new measure cannot be added to the
/// per-contract row and then quietly forgotten by the sum, the kind rollup, or
/// the base-units-to-decimal conversion. Each of those three iterates this.
const VOLUME_KEYS = [
  'fundedUsdc',
  'releasedUsdc',
  'settledUsdc',
  'refundedUsdc',
  'feesUsdc',
  'advancedUsdc',
  'repaidUsdc',
  'slashedUsdc',
  'stakedUsdc',
  'yieldUsdc',
] as const satisfies readonly (keyof LifetimeVolumes)[];

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

    // --- Trade finance -----------------------------------------------------
    //
    // Two rails, one meaning. `POFunded` is a purchase-order advance and
    // `ReceivableAssigned` is an invoice factored, and in both a financier
    // hands a supplier capital before the buyer has settled. They belong in one
    // bucket for the same reason MilestoneClaimed and ProgressReleased do: the
    // page reports what the money did, not which contract said it.
    //
    // Deliberately NOT added to fundedUsdc. An advance is a second party's
    // capital moving against a deal that already counted its own value when the
    // escrow was funded, so folding the two together would report the same
    // trade twice and overstate the platform's volume.
    case 'POFunded':
      row.financings += 1;
      add('advancedUsdc', first('principalUsdc'));
      break;
    case 'ReceivableAssigned':
      row.financings += 1;
      add('advancedUsdc', first('advanceUsdc'));
      break;
    case 'PORepaid':
      add('repaidUsdc', first('repayUsdc'));
      break;
    case 'PODefaulted':
      row.defaults += 1;
      break;
    case 'CollateralSlashed':
      // Collateral forfeited on a defaulted advance. Same bucket as a lost
      // dispute: in both, stake a seller posted went to the other side.
      add('slashedUsdc', first('amount'));
      break;

    // --- Staking -----------------------------------------------------------
    case 'Deposited':
      // Two contracts declare `Deposited` with different shapes, so the name
      // alone does not say what happened. The vault's is a seller locking their
      // own capital as deal insurance. The treasury's is the platform moving
      // its own fee balance around, which is not user volume and must not be
      // counted as staked.
      if (row.kind === 'staking') add('stakedUsdc', first('principal'));
      break;
    case 'Slashed':
      add('slashedUsdc', first('amount'));
      break;

    // --- Yield -------------------------------------------------------------
    case 'YieldClaimed':
      // Claimed, not credited. YieldCredited is an accrual the distributor
      // records daily; only a claim is money that reached a wallet, and the
      // difference between the two is the unclaimed balance.
      add('yieldUsdc', first('amount'));
      break;

    // --- Market activity ---------------------------------------------------
    case 'JobPosted':
      row.jobsPosted += 1;
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

/// The addresses worth asking about for a window ending at `toBlock`, split
/// into groups the RPC will accept.
///
/// Two savings, both free. A contract cannot emit a log before the block it was
/// created in, so the early history only ever needs to ask about the handful of
/// contracts that existed then: the first few million blocks are one request
/// per window rather than four. And the groups keep every call under the
/// measured address cap.
function addressGroupsFor(toBlock: bigint): string[][] {
  const live = DEPLOY_LEDGER.filter((c) => c.deployBlock <= toBlock).map((c) => c.address);
  const groups: string[][] = [];
  for (let i = 0; i < live.length; i += ADDRESS_BATCH) {
    groups.push(live.slice(i, i + ADDRESS_BATCH));
  }
  return groups;
}

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
      // Probe with exactly the shape the sweep will use: one address batch at
      // full width. Probing with the whole ledger would reject every endpoint,
      // since no provider accepts 55 addresses in one filter.
      await probe.getLogs({
        address: ALL_ADDRESSES.slice(0, ADDRESS_BATCH),
        fromBlock: from,
        toBlock: head,
      });
      capable.push(url);
      onProgress?.(
        `rpc ${hostOf(url)}: serves ${CHUNK_BLOCKS}-block windows over ${ADDRESS_BATCH} addresses`,
      );
    } catch (err) {
      const detail = /Details: ([^\n]*)/.exec((err as Error).message)?.[1] ?? 'request failed';
      onProgress?.(`rpc ${hostOf(url)}: SKIPPED, ${detail.slice(0, 100)}`);
    }
  }

  if (capable.length === 0) {
    throw new Error(
      `no configured Arc RPC can serve a ${CHUNK_BLOCKS}-block getLogs window over ` +
        `${ADDRESS_BATCH} addresses (tried ${RPC_URLS.map(hostOf).join(', ')}). Arc reports ` +
        `both an over-wide range and too many addresses as "requested range too large", so ` +
        `lower LIFETIME_SCAN_ADDRESS_BATCH before LIFETIME_SCAN_CHUNK_BLOCKS.`,
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isRateLimit(err: Error): boolean {
  const msg = err.message ?? '';
  return /rate limit|429|-32005|too many requests/i.test(msg);
}

/// Pace requests instead of racing the rate limiter into a wall.
///
/// The first version had no pacing and simply backed off after each rejection,
/// which is far slower than it sounds: the endpoint spends most of the sweep
/// refusing, and every refusal costs a doubling. Spacing requests a fixed
/// distance apart keeps the sweep under the limit in the first place, and a
/// request that is never refused never has to wait seconds to try again.
///
/// A single global chain rather than a token bucket, because there is one
/// endpoint and the only thing that matters is the gap between consecutive
/// calls to it.
let nextSlot = 0;

async function takeSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot, cooldownUntil);
  nextSlot = at + REQUEST_GAP_MS;
  if (at > now) await sleep(at - now);
}

/// Shared brake across every in-flight window.
///
/// Rate limiting is a property of the endpoint, not of one request, so a window
/// that trips it has learned something the others need. Deliberately a SHORT
/// pause rather than the full backoff of whichever request failed: the others
/// have not failed, and stalling all of them for a minute because one did is
/// what made the resumed sweep crawl. The failing request still serves its own
/// exponential wait.
let cooldownUntil = 0;

/// One getLogs call, retried with backoff. Splits the two failure modes on
/// purpose: a rate limit is a wait, and anything else is probably a real
/// rejection that no amount of waiting fixes.
async function getLogsWithRetry(
  client: PublicClient,
  addresses: string[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < CHUNK_RETRIES; attempt += 1) {
    await takeSlot();
    try {
      const logs = await client.getLogs({
        address: addresses as `0x${string}`[],
        fromBlock,
        toBlock,
      });
      return logs.map((l) => ({
        address: l.address.toLowerCase(),
        blockNumber: l.blockNumber ?? 0n,
        transactionHash: l.transactionHash ?? null,
        topics: l.topics as readonly string[],
        data: l.data,
      }));
    } catch (err) {
      lastErr = err as Error;
      if (attempt === CHUNK_RETRIES - 1) break;
      if (isRateLimit(lastErr)) {
        // The brake the others feel is short and fixed. The wait THIS request
        // serves is the exponential one, jittered so concurrent windows do not
        // all come back at the same instant and trip the limit together.
        const wait = RATE_LIMIT_BACKOFF_MS * 2 ** Math.min(attempt, 5);
        cooldownUntil = Math.max(cooldownUntil, Date.now() + RATE_LIMIT_BRAKE_MS);
        await sleep(wait + Math.random() * 250);
      } else {
        await sleep(CHUNK_BACKOFF_MS * 2 ** attempt);
      }
    }
  }
  // Thrown, never swallowed to an empty array. An empty array here would be
  // indistinguishable from "this window really had nothing", and would
  // permanently under-report the total once the cursor moved past it.
  throw lastErr ?? new Error(`lifetime scan failed for window ${fromBlock}-${toBlock}`);
}

/// One window, every contract that existed by the end of it.
///
/// The address list is split because Arc rejects a filter naming more than
/// twenty, so a window costs one call per batch rather than one call flat.
///
/// The batches are issued in SEQUENCE, not in parallel. The windows above
/// already run concurrently, and multiplying the two just buries the endpoint.
///
/// Measured, because this was got wrong once. Twelve requests issued one after
/// another were refused zero times and took a flat ~2s each, which reads like a
/// slow endpoint with spare capacity. It is not: six issued at once returned
/// two answers and four `rate limit exceeded`. Arc's public RPC serves roughly
/// two requests in flight and refuses the rest, so concurrency above that buys
/// nothing and costs a backoff on everything it refused.
///
/// The batches are still ONE window, and that is what keeps the transaction
/// count exact. Their logs are merged before anything is counted, so a
/// transaction touching contracts in two different batches is deduped the same
/// way as one touching two contracts in the same batch.
async function scanWindow(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLog[]> {
  const groups = addressGroupsFor(toBlock);
  const all: RawLog[] = [];
  for (const group of groups) {
    all.push(...(await getLogsWithRetry(client, group, fromBlock, toBlock)));
  }
  return all;
}

/// Exported for tests. This is where base units become decimal USDC, so it is
/// where a formatting mismatch between the totals and the breakdown would
/// appear.
/// Sum the money fields of a set of accumulator rows and convert to decimal
/// USDC in one step. Rows are in base units; everything this returns is not.
function volumesOf(rows: ContractLifetime[]): LifetimeVolumes {
  const out = {} as LifetimeVolumes;
  for (const key of VOLUME_KEYS) {
    const total = rows.reduce((t, c) => t + BigInt(c[key]), 0n);
    out[key] = formatUnits(total, USDC_DECIMALS);
  }
  return out;
}

/// Fixed presentation order, money-first. Sorting by size instead would let the
/// page reshuffle itself between two refreshes over a few USDC of difference.
const KIND_ORDER: readonly ContractKind[] = [
  'settlement',
  'financing',
  'staking',
  'treasury',
  'registry',
];

export function projectFromAcc(acc: Acc, head: bigint): LifetimeStats {
  const rows = DEPLOY_LEDGER.map((c) => acc.perContract[c.address]).filter(
    (c): c is ContractLifetime => !!c,
  );

  // The accumulator holds base units so the running sums stay exact. Everything
  // that leaves this function is decimal USDC, including the per-contract rows:
  // an API where the totals are formatted and the breakdown beside them is not
  // is an API whose breakdown gets rendered a million times too large.
  const contracts: ContractLifetime[] = rows.map((c) => {
    const money = volumesOf([c]);
    return { ...c, ...money };
  });

  const byKind: KindRollup[] = KIND_ORDER.map((kind) => {
    const inKind = rows.filter((c) => c.kind === kind);
    return {
      kind,
      contracts: inKind.length,
      contractsWithActivity: inKind.filter((c) => c.events > 0).length,
      events: inKind.reduce((t, c) => t + c.events, 0),
      deals: inKind.reduce((t, c) => t + c.deals, 0),
      financings: inKind.reduce((t, c) => t + c.financings, 0),
      defaults: inKind.reduce((t, c) => t + c.defaults, 0),
      jobsPosted: inKind.reduce((t, c) => t + c.jobsPosted, 0),
      volumes: volumesOf(inKind),
    };
  });

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
      financings: contracts.reduce((t, c) => t + c.financings, 0),
      defaults: contracts.reduce((t, c) => t + c.defaults, 0),
      jobsPosted: contracts.reduce((t, c) => t + c.jobsPosted, 0),
    },
    volumes: volumesOf(rows),
    byKind,
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
  // With one usable endpoint there is nothing to rotate to, so a rate limit is
  // a stall rather than a detour, and the parallelism is halved.
  //
  // Measured 2026-08-19, and the number is small because the endpoint is strict
  // rather than slow: six requests issued at once to Arc's public RPC returned
  // two answers and four `rate limit exceeded`. Two in flight is roughly what it
  // will serve. Raising this looks like it should help and does the opposite,
  // since every refusal costs a backoff. LIFETIME_SCAN_CONCURRENCY is the knob
  // if a dedicated node ever changes the answer.
  const concurrency = endpoints > 1 ? CONCURRENCY : Math.max(2, Math.floor(CONCURRENCY / 2));
  const head = await client.getBlockNumber();

  const acc: Acc = accumulator ?? {
    ledgerFingerprint: LEDGER_FINGERPRINT,
    cursor: (EARLIEST_DEPLOY - 1n).toString(),
    perContract: {},
    transactions: 0,
    scannedAt: 0,
  };
  acc.ledgerFingerprint = LEDGER_FINGERPRINT;
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

  let lastPersist = Date.now();
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

    // Checkpoint on a clock, not on a batch count.
    //
    // It used to fire every 20 batches, which is only a fixed number of windows
    // if concurrency never changes. Raising concurrency from 2 to 4 quietly
    // doubled the gap to 80 windows, and a nine-minute run against a slow
    // endpoint finished having saved nothing at all: the work was real, the
    // cursor never moved, and the next run redid it. Wall-clock is the property
    // actually wanted, since what a checkpoint protects against is the run being
    // killed.
    if (Date.now() - lastPersist >= PERSIST_EVERY_MS) {
      lastPersist = Date.now();
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
  // A snapshot from a different contract list is not a stale snapshot, it is a
  // snapshot of a different question. Resuming it would step the cursor past
  // the new contracts' history and leave them at zero permanently, so refuse
  // it and let the route report "not scanned yet" until a re-seed runs.
  if (p.acc.ledgerFingerprint !== LEDGER_FINGERPRINT) {
    logger.warn(
      { found: p.acc.ledgerFingerprint ?? 'none', expected: LEDGER_FINGERPRINT },
      'lifetime stats: snapshot was built from a different contract ledger, ignoring it. ' +
        'Run `npm run scan:lifetime` to re-seed.',
    );
    return false;
  }
  accumulator = p.acc;
  cached = p.snapshot;
  hydrated = true;
  return true;
}

/// Load the last seed from disk, then Postgres. The seed is expensive enough
/// (a full sweep of ~87M blocks the first time) that a boot must never trigger
/// it implicitly: without a snapshot the route reports "not scanned yet" and
/// the ops script is what produces one.
let hydrated = false;
let lastHydrateAttempt = 0;
/// Retry gap when nothing was found. Long enough that a bucket with no snapshot
/// is not queried on every request, short enough that a seed run lands without
/// a restart.
const HYDRATE_RETRY_MS = 30_000;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  // Only latch on SUCCESS.
  //
  // Latching on the attempt meant a container that was asked for stats before
  // the seed existed served 503 for the rest of its life: the seed script would
  // write the snapshot, the route would never look again, and the only cure was
  // a restart nobody knew they needed. Since the seed is a separate ops step
  // that by definition runs after boot, that is the normal case, not an edge.
  if (Date.now() - lastHydrateAttempt < HYDRATE_RETRY_MS) return;
  lastHydrateAttempt = Date.now();
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
///
/// 60 seconds, because the page polls and is expected to track the chain. That
/// is affordable only because the refresh is incremental: once seeded, the
/// cursor sits near head and a refresh is one or two getLogs windows, not a
/// sweep. Raising CHUNK_BLOCKS to 20,000 made even a minute of new blocks fit
/// in a single request.
const REFRESH_AFTER_MS = Number(process.env.LIFETIME_REFRESH_MS ?? 60_000);
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
  // The retry gap too, or a reset in one test is silently blocked by the
  // hydrate another test attempted seconds earlier.
  lastHydrateAttempt = 0;
}

/// Wind the retry gap back so a test can assert the next hydrate actually looks
/// again, without sleeping for the real interval.
export function __expireHydrateBackoffForTest(): void {
  lastHydrateAttempt = 0;
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
