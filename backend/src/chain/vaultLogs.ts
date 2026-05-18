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
/// 500,000 blocks at Arc's ~2s cadence is ~11 days. Plenty for testnet
/// sessions that run weeks. Producers should set the deploy-block env var
/// for production so we don't waste calls scanning blocks that predate the
/// contract.
const DEFAULT_HISTORY_WINDOW = 500_000n;

/// Returns every `Deposited` event emitted by the configured vault that was
/// authored by `ownerAddress`. Paginates through PAGE_SIZE windows from the
/// vault's deployment (or DEFAULT_HISTORY_WINDOW back from head) to the
/// latest block. The caller filters in JS — some Arc testnet RPCs silently
/// drop topic-indexed filters when the range is wide, so we fetch all
/// vault Deposited logs in each window and let the caller pick.
export async function fetchDepositedLogsForOwner(
  vaultAddress: `0x${string}`,
  ownerAddress: string,
): Promise<DepositedLog[]> {
  const owner = ownerAddress.toLowerCase();
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, vault: vaultAddress },
      'vaultLogs: getBlockNumber failed',
    );
    return [];
  }

  const startConfig = (
    config as unknown as { KARWAN_VAULT_DEPLOY_BLOCK?: bigint }
  ).KARWAN_VAULT_DEPLOY_BLOCK;
  let start: bigint;
  if (startConfig != null && startConfig >= 0n) {
    start = startConfig;
  } else {
    start = head > DEFAULT_HISTORY_WINDOW ? head - DEFAULT_HISTORY_WINDOW : 0n;
  }

  if (start > head) return [];

  const collected: DepositedLog[] = [];
  let cursor = start;
  // Hard cap on pages to keep a misconfigured deploy-block from spinning
  // forever. At PAGE_SIZE = 9500 this lets us cover up to ~950k blocks
  // (~22 days at 2s cadence), well past the DEFAULT_HISTORY_WINDOW.
  const MAX_PAGES = 100;
  let pages = 0;

  while (cursor <= head && pages < MAX_PAGES) {
    const upper = cursor + PAGE_SIZE - 1n;
    const toBlock = upper > head ? head : upper;
    try {
      const rawLogs = await publicClient.getLogs({
        address: vaultAddress,
        event: vaultDepositedEvent,
        fromBlock: cursor,
        toBlock,
      });
      for (const log of rawLogs) {
        const args = (log as unknown as {
          args: { positionId?: bigint; owner?: `0x${string}`; principal?: bigint };
        }).args;
        if (!args.owner || !args.positionId || args.principal == null) continue;
        if (args.owner.toLowerCase() !== owner) continue;
        collected.push({
          positionId: args.positionId,
          owner: args.owner,
          principal: args.principal,
          blockNumber: (log as unknown as { blockNumber: bigint }).blockNumber,
        });
      }
    } catch (err) {
      logger.error(
        {
          err: (err as Error).message,
          vault: vaultAddress,
          owner,
          fromBlock: cursor.toString(),
          toBlock: toBlock.toString(),
        },
        'vaultLogs: getLogs page failed',
      );
      // Continue paginating; a single bad RPC page should not erase the
      // user's stake from view.
    }
    cursor = toBlock + 1n;
    pages += 1;
  }

  logger.info(
    {
      vault: vaultAddress,
      owner,
      start: start.toString(),
      head: head.toString(),
      pages,
      matched: collected.length,
    },
    'vaultLogs: paginated read complete',
  );
  return collected;
}
