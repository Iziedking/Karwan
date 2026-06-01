import { parseAbiItem, formatUnits, type Hex } from 'viem';
import { publicClient } from './client.js';
import { usdc as USDC_ADDR } from './contracts.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

// USDC on Arc is exposed both as a 6-decimal ERC-20 and an 18-decimal native
// asset. Transfer events emit at 6 decimals on the ERC-20 surface, which is
// what every settlement, milestone release, cashout, and faucet drip rides.
const USDC_DECIMALS = 6;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const POLL_INTERVAL_MS = 12_000;
// How many blocks to look back on first start. Arc is ~780ms/block so 600
// blocks covers about eight minutes, enough to catch a credit landing
// across a service restart without scanning history.
const BOOT_LOOKBACK_BLOCKS = 600n;
const REGISTRY_REFRESH_MS = 60_000;
// USDC moves below this threshold are skipped to keep notifications useful
// during agent fee-collection traffic.
const MIN_NOTIFY_USDC = 0.005;

type WalletRole = 'identity' | 'buyerAgent' | 'sellerAgent';

interface TrackedWallet {
  address: string;
  role: WalletRole;
  owner: string;
}

interface Registry {
  byAddress: Map<string, TrackedWallet>;
  /// All addresses that belong to a given owner, used to detect intra-user
  /// transfers (sweeping from a deal wallet to the identity wallet) so they
  /// don't trigger a credit notification on the receiving side.
  ownerAddresses: Map<string, Set<string>>;
}

let registry: Registry = { byAddress: new Map(), ownerAddresses: new Map() };
let registryBuiltAt = 0;
let lastScannedBlock: bigint | null = null;
let pollTimer: NodeJS.Timeout | null = null;
const seenTransfers = new Set<string>();
// Bounded so the dedupe set does not grow forever. Trims to half on every
// overflow.
const SEEN_TRANSFERS_CAP = 10_000;

async function refreshRegistry(force = false): Promise<Registry> {
  const now = Date.now();
  if (!force && now - registryBuiltAt < REGISTRY_REFRESH_MS && registry.byAddress.size > 0) {
    return registry;
  }
  try {
    const all = await listAllAgentWallets();
    const byAddress = new Map<string, TrackedWallet>();
    const ownerAddresses = new Map<string, Set<string>>();
    for (const w of all) {
      const owner = w.userAddress.toLowerCase();
      const identity = owner;
      const buyer = w.buyerAddress?.toLowerCase();
      const seller = w.sellerAddress?.toLowerCase();
      const set = ownerAddresses.get(owner) ?? new Set<string>();
      if (identity) {
        byAddress.set(identity, { address: identity, role: 'identity', owner });
        set.add(identity);
      }
      if (buyer) {
        byAddress.set(buyer, { address: buyer, role: 'buyerAgent', owner });
        set.add(buyer);
      }
      if (seller) {
        byAddress.set(seller, { address: seller, role: 'sellerAgent', owner });
        set.add(seller);
      }
      ownerAddresses.set(owner, set);
    }
    registry = { byAddress, ownerAddresses };
    registryBuiltAt = now;
    return registry;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'balance watcher: registry refresh failed, reusing last snapshot',
    );
    return registry;
  }
}

function rememberTransfer(key: string): boolean {
  if (seenTransfers.has(key)) return false;
  seenTransfers.add(key);
  if (seenTransfers.size > SEEN_TRANSFERS_CAP) {
    const keep = Array.from(seenTransfers).slice(seenTransfers.size / 2);
    seenTransfers.clear();
    for (const k of keep) seenTransfers.add(k);
  }
  return true;
}

function roleLabel(role: WalletRole): string {
  if (role === 'identity') return 'identity wallet';
  if (role === 'buyerAgent') return 'buyer agent wallet';
  return 'seller agent wallet';
}

async function processWindow(fromBlock: bigint, toBlock: bigint): Promise<void> {
  if (fromBlock > toBlock) return;
  const reg = await refreshRegistry();
  if (reg.byAddress.size === 0) return;

  // Pull every USDC Transfer in the window and filter against the registry
  // client-side. Per-address filters would need one getLogs call per wallet,
  // which is wasteful when the registry is small.
  let logs;
  try {
    logs = await publicClient.getLogs({
      address: USDC_ADDR,
      event: TRANSFER_EVENT,
      fromBlock,
      toBlock,
    });
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() },
      'balance watcher: getLogs failed',
    );
    return;
  }

  for (const log of logs) {
    const args = log.args as { from?: `0x${string}`; to?: `0x${string}`; value?: bigint };
    const from = args.from?.toLowerCase();
    const to = args.to?.toLowerCase();
    const value = args.value ?? 0n;
    if (!from || !to || value === 0n) continue;

    const recipient = reg.byAddress.get(to);
    const sender = reg.byAddress.get(from);

    // Skip intra-user transfers entirely (a user sweeping their seller agent
    // into their identity wallet should not look like a credit landing from
    // the outside).
    if (recipient && sender && recipient.owner === sender.owner) continue;

    const amountUsdc = Number(formatUnits(value, USDC_DECIMALS));
    if (!Number.isFinite(amountUsdc) || amountUsdc < MIN_NOTIFY_USDC) continue;

    const txHash = log.transactionHash ?? '0x';
    const logIndex = log.logIndex ?? 0;
    const dedupeKey = `${txHash}:${logIndex}`;

    if (recipient) {
      if (!rememberTransfer(`credit:${dedupeKey}`)) continue;
      bus.emitEvent({
        type: 'wallet.credited',
        actor: 'platform',
        payload: {
          owner: recipient.owner,
          walletAddress: recipient.address,
          walletRole: recipient.role,
          walletLabel: roleLabel(recipient.role),
          amountUsdc: amountUsdc.toFixed(6),
          from,
          txHash,
        },
      });
      continue;
    }

    if (sender) {
      if (!rememberTransfer(`debit:${dedupeKey}`)) continue;
      bus.emitEvent({
        type: 'wallet.debited',
        actor: 'platform',
        payload: {
          owner: sender.owner,
          walletAddress: sender.address,
          walletRole: sender.role,
          walletLabel: roleLabel(sender.role),
          amountUsdc: amountUsdc.toFixed(6),
          to,
          txHash,
        },
      });
    }
  }
}

async function tick(): Promise<void> {
  let head: bigint;
  try {
    head = await publicClient.getBlockNumber();
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'balance watcher: getBlockNumber failed, skipping tick',
    );
    return;
  }
  const start = lastScannedBlock === null ? head - BOOT_LOOKBACK_BLOCKS : lastScannedBlock + 1n;
  const from = start < 0n ? 0n : start;
  await processWindow(from, head);
  lastScannedBlock = head;
}

export function startBalanceWatcher(): () => void {
  if (pollTimer) return stopBalanceWatcher;
  void refreshRegistry(true);
  // Fire once on boot so a credit landing during a restart still surfaces,
  // then settle into the regular cadence.
  void tick();
  pollTimer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  logger.info(
    { intervalMs: POLL_INTERVAL_MS, lookbackBlocks: BOOT_LOOKBACK_BLOCKS.toString() },
    'balance watcher started',
  );
  return stopBalanceWatcher;
}

export function stopBalanceWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export type { TrackedWallet, WalletRole };

// Helper exposed for tests and the manual replay route.
export async function replayWindow(fromBlock: bigint, toBlock: bigint): Promise<void> {
  await processWindow(fromBlock, toBlock);
}

// Re-export for ad-hoc inspection. Keep the surface small.
export function debugSnapshot(): {
  trackedAddresses: number;
  lastScannedBlock: string | null;
} {
  return {
    trackedAddresses: registry.byAddress.size,
    lastScannedBlock: lastScannedBlock === null ? null : lastScannedBlock.toString(),
  };
}

// Used by `txHash` payload typing in the bus consumer.
export type { Hex };
