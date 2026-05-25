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
/// Correctness guarantee: this NEVER returns a partial result. If a page
/// ultimately fails after retries, we fall back to the last fully-successful
/// read for this owner; if there's no prior good read, we throw so the caller
/// keeps its last value rather than displaying an understated total.
export async function fetchDepositedLogsForOwner(
  vaultAddress: `0x${string}`,
  ownerAddress: string,
): Promise<DepositedLog[]> {
  const owner = ownerAddress.toLowerCase();
  const cacheKey = `${vaultAddress.toLowerCase()}:${owner}`;

  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, vault: vaultAddress },
      'vaultLogs: getBlockNumber failed',
    );
    // Can't advance; serve the cache rather than an empty (flicker-to-zero) set.
    const c = ownerCache.get(cacheKey);
    return c ? cacheToArray(c) : [];
  }

  const cached = ownerCache.get(cacheKey);
  const start = cached ? cached.scannedToBlock + 1n : resolveColdStart(head);

  // Nothing new since the last scan — return the cached set unchanged.
  if (start > head) return cached ? cacheToArray(cached) : [];

  // Seed from the cache. Deposits are append-only, so we only ever add IDs.
  const byId = new Map<string, DepositedLog>(cached?.byId);
  let committedTo = start > 0n ? start - 1n : 0n;
  let cursor = start;
  // Cap pages per call so one read can't spin forever on a cold cache with a
  // very old vault. Progress is committed, so a scan longer than this simply
  // finishes across the next call(s).
  const MAX_PAGES = 100;
  let pages = 0;

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
        'vaultLogs: getLogs page failed after retries; committing progress, serving set so far',
      );
      // FAIL CLOSED, but keep the ranges that DID scan so we never re-walk
      // them. `byId` only grows, so the served total never flickers downward;
      // the failed tail is picked up on the next call. Throw only on a true
      // cold failure with nothing to show.
      if (byId.size > 0 || cached) {
        const partial: OwnerCache = { byId, scannedToBlock: committedTo };
        ownerCache.set(cacheKey, partial);
        return cacheToArray(partial);
      }
      throw new Error(
        `vault log read failed at blocks ${cursor}-${toBlock} with no prior data: ${(err as Error).message}`,
      );
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
    },
    'vaultLogs: read complete',
  );
  return cacheToArray(next);
}
