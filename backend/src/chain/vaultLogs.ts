import { config } from '../config.js';
import { publicClient } from './client.js';
import { logger } from '../logger.js';

const vaultDepositedEvent = {
  type: 'event',
  name: 'Deposited',
  inputs: [
    { name: 'positionId', type: 'uint256', indexed: true },
    { name: 'owner', type: 'address', indexed: true },
    { name: 'principal', type: 'uint256', indexed: false },
  ],
} as const;

export interface DepositedLog {
  positionId: bigint;
  owner: `0x${string}`;
  principal: bigint;
  blockNumber: bigint;
}

/// Arc testnet's public RPC caps eth_getLogs at a strict 10,000-block range.
/// We stay 500 blocks under that ceiling for safety and paginate across the
/// vault's full history. Earlier code anchored fromBlock at `latest - 9500`,
/// which only covered ~5h of Arc time and made any older position disappear
/// from the UI after a refresh.
const PAGE_SIZE = 9_500n;

/// How far back the reader walks when KARWAN_VAULT_DEPLOY_BLOCK is unset.
/// 5,000,000 blocks at Arc's ~2s cadence is ~115 days. The previous 500k
/// (~11 days) window silently dropped positions older than it on every cold
/// start, so a stake total would shrink after a redeploy and "recover" only
/// once an older process's cache happened to still hold them. A testnet
/// session can't outrun 115 days, so positions no longer age out of view.
/// Producers should still set KARWAN_VAULT_DEPLOY_BLOCK so the cold scan
/// anchors at the contract and never wastes calls on blocks that predate it.
const DEFAULT_HISTORY_WINDOW = 5_000_000n;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/// Incremental log cache per (vault, owner). `Deposited` events are immutable
/// and append-only, so once we've scanned blocks up to `scannedToBlock` we
/// never re-scan them — later reads only fetch the handful of new blocks since.
/// This is what kills the "stake total flickers" bug AND the load that caused
/// it: the first read walks the vault's full history (~50 pages), every read
/// after that is a single page. `byId` (keyed by positionId) only ever grows,
/// so the position set is monotonic and can never bounce downward between
/// refreshes. A page that fails after retries commits the progress made and
/// serves the set so far; the missing tail is picked up on the next call.
interface OwnerCache {
  byId: Map<string, DepositedLog>;
  scannedToBlock: bigint;
}
const ownerCache = new Map<string, OwnerCache>();

function cacheToArray(c: OwnerCache): DepositedLog[] {
  return [...c.byId.values()];
}

/// Result shape callers consume. `logs` is whatever the cache holds; `synced`
/// is true when the cache has been walked all the way to the current chain
/// head with no failed pages. Surfacing this lets the UI render a "syncing"
/// state instead of an under-counted total (e.g. a credit-passport that
/// loaded mid-scan and saw only the older subset of positions).
export interface DepositedReadResult {
  logs: DepositedLog[];
  synced: boolean;
}

/// In-flight scan dedupe per (vault, owner). Concurrent reads for the same
/// owner all await the same scan promise instead of triggering parallel scans
/// — saves RPC pressure and prevents the "two callers see two different
/// partial states" flicker that caused 85.2 vs 235.2 on the same wallet.
const inFlight = new Map<string, Promise<DepositedReadResult>>();

let warnedMissingDeployBlock = false;

function resolveColdStart(head: bigint): bigint {
  const startConfig = (
    config as unknown as { KARWAN_VAULT_DEPLOY_BLOCK?: bigint }
  ).KARWAN_VAULT_DEPLOY_BLOCK;
  if (startConfig != null && startConfig >= 0n) return startConfig;
  // Money-critical read: a missing anchor must be loud, not silent. Without it
  // the scan walks a sliding window relative to head, so any position older than
  // the window vanishes from the stake total until a later read happens to cover
  // it. Warn once so the operator sets the deploy block.
  if (!warnedMissingDeployBlock) {
    warnedMissingDeployBlock = true;
    logger.warn(
      { defaultWindowBlocks: DEFAULT_HISTORY_WINDOW.toString() },
      'vaultLogs: KARWAN_VAULT_DEPLOY_BLOCK is unset; cold scans use a sliding default window. Set it to the vault deploy block so full position history is always covered.',
    );
  }
  return head > DEFAULT_HISTORY_WINDOW ? head - DEFAULT_HISTORY_WINDOW : 0n;
}

/// `getLogs` for one page with retries + backoff. Arc's public RPC 502s /
/// rate-limits intermittently, especially when a read spans many pages. viem
/// retries internally, but a wide scan still trips it, so these extra attempts
/// make a page far less likely to ultimately fail and abort the whole read.
async function getLogsPageWithRetry(
  vaultAddress: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
  attempts = 4,
): Promise<readonly unknown[]> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await publicClient.getLogs({
        address: vaultAddress,
        event: vaultDepositedEvent,
        fromBlock,
        toBlock,
      });
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(250 * (i + 1));
    }
  }
  throw lastErr;
}

/// Returns every `Deposited` event emitted by the configured vault that was
/// authored by `ownerAddress`. Paginates through PAGE_SIZE windows from the
/// vault's deployment (or DEFAULT_HISTORY_WINDOW back from head) to the
/// latest block. The caller filters in JS — some Arc testnet RPCs silently
/// drop topic-indexed filters when the range is wide, so we fetch all
/// vault Deposited logs in each window and let the caller pick.
///
/// Result shape:
///   { logs: DepositedLog[], synced: boolean }
///
/// `synced` is true when the cache's scannedToBlock has reached `head` with
/// no failed pages. The cache `byId` is monotonic (only ever grows), so even
/// when `synced` is false the served set is a strict subset of the eventual
/// full set — never wrong, just incomplete. Consumers that care about
/// completeness (UI totals, score-affecting reads) inspect `synced` and
/// surface a syncing state instead of treating the partial as authoritative.
///
/// Concurrent reads for the same (vault, owner) share one in-flight scan via
/// the `inFlight` map. Without this, a credit-passport load and a /profile
/// load fired within seconds of each other would each start their own scan
/// and could observe different commit points, producing the 85.2 vs 235.2
/// flicker that motivated this rewrite.
export function fetchDepositedLogsForOwner(
  vaultAddress: `0x${string}`,
  ownerAddress: string,
): Promise<DepositedReadResult> {
  const owner = ownerAddress.toLowerCase();
  const cacheKey = `${vaultAddress.toLowerCase()}:${owner}`;
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const p = runScan(vaultAddress, owner, cacheKey).finally(() => {
    inFlight.delete(cacheKey);
  });
  inFlight.set(cacheKey, p);
  return p;
}

/// Cap on pages walked in one call. Set high enough that a typical cold scan
/// (vault deployed within the DEFAULT_HISTORY_WINDOW) completes in one call,
/// so the UI never observes a permanent partial state. 600 × PAGE_SIZE =
/// 5.7M blocks, covering the default window plus headroom. The retry +
/// backoff inside getLogsPageWithRetry keeps the worst case bounded; the
/// in-flight dedupe means parallel callers don't multiply the cost.
const MAX_PAGES = 600;

async function runScan(
  vaultAddress: `0x${string}`,
  owner: string,
  cacheKey: string,
): Promise<DepositedReadResult> {
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, vault: vaultAddress },
      'vaultLogs: getBlockNumber failed',
    );
    // Can't advance; serve the cache rather than an empty (flicker-to-zero) set.
    // Cache-only serves are inherently un-synced because we couldn't confirm head.
    const c = ownerCache.get(cacheKey);
    return { logs: c ? cacheToArray(c) : [], synced: false };
  }

  const cached = ownerCache.get(cacheKey);
  const start = cached ? cached.scannedToBlock + 1n : resolveColdStart(head);

  // Nothing new since the last scan — return the cached set unchanged.
  if (start > head) {
    return {
      logs: cached ? cacheToArray(cached) : [],
      synced: cached != null,
    };
  }

  // Seed from the cache. Deposits are append-only, so we only ever add IDs.
  const byId = new Map<string, DepositedLog>(cached?.byId);
  let committedTo = start > 0n ? start - 1n : 0n;
  let cursor = start;
  let pages = 0;
  let failed = false;

  while (cursor <= head && pages < MAX_PAGES) {
    const upper = cursor + PAGE_SIZE - 1n;
    const toBlock = upper > head ? head : upper;
    let rawLogs: readonly unknown[];
    try {
      rawLogs = await getLogsPageWithRetry(vaultAddress, cursor, toBlock);
    } catch (err) {
      logger.error(
        {
          err: (err as Error).message,
          vault: vaultAddress,
          owner,
          fromBlock: cursor.toString(),
          toBlock: toBlock.toString(),
        },
        'vaultLogs: getLogs page failed after retries; committing progress, serving partial set with synced=false',
      );
      // FAIL CLOSED, but keep the ranges that DID scan so we never re-walk
      // them. `byId` only grows, so the served total never flickers downward;
      // the failed tail is picked up on the next call. `synced` is false so
      // the UI knows this is provisional.
      failed = true;
      break;
    }
    for (const log of rawLogs) {
      const args = (log as unknown as {
        args: { positionId?: bigint; owner?: `0x${string}`; principal?: bigint };
      }).args;
      if (!args.owner || !args.positionId || args.principal == null) continue;
      if (args.owner.toLowerCase() !== owner) continue;
      byId.set(args.positionId.toString(), {
        positionId: args.positionId,
        owner: args.owner,
        principal: args.principal,
        blockNumber: (log as unknown as { blockNumber: bigint }).blockNumber,
      });
    }
    committedTo = toBlock;
    cursor = toBlock + 1n;
    pages += 1;
  }

  const next: OwnerCache = { byId, scannedToBlock: committedTo };
  ownerCache.set(cacheKey, next);

  // Synced iff we reached head WITHOUT bailing on a page failure or the
  // page cap. A cap hit means the scan is mid-flight and the next call will
  // pick up where this one stopped.
  const synced = !failed && pages < MAX_PAGES && committedTo >= head;

  logger.info(
    {
      vault: vaultAddress,
      owner,
      start: start.toString(),
      head: head.toString(),
      scannedToBlock: committedTo.toString(),
      pages,
      matched: byId.size,
      incremental: cached != null,
      synced,
    },
    'vaultLogs: read complete',
  );

  return { logs: cacheToArray(next), synced };
}
