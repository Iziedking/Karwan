import { parseAbiItem, formatUnits, type Hex } from 'viem';
import { publicClient } from './client.js';
import { usdc as USDC_ADDR } from './contracts.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { recordHeartbeat } from '../ops/heartbeats.js';
import {
  observedArcDepositOperationKey,
  recordObservedArcTransfer,
} from '../money/observedDeposit.js';
import { findMoneyMovementByTransferProof } from '../db/moneyMovements.js';

// USDC on Arc is exposed both as a 6-decimal ERC-20 and an 18-decimal native
// asset. Transfer events emit at 6 decimals on the ERC-20 surface, which is
// what every settlement, milestone release, cashout, and faucet drip rides.
const USDC_DECIMALS = 6;

const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/// Poll cadence override. 12s burned through every free-tier RPC quota
/// within minutes (each tick fires a getBlockNumber + a getLogs on the
/// USDC transfer topic). 60s is a better default, still well inside the
/// Telegram-credit notification expectation, way under any rate-limit
/// budget. Configurable in case a future paid RPC tier wants tighter polling.
const POLL_INTERVAL_MS = Number(process.env.BALANCE_WATCHER_POLL_MS ?? 60_000);
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
    // TRIPWIRE: this map is keyed by address alone and attributes every balance
    // change to the matched wallet's owner. That is only sound because every
    // address here is on ARC. Circle derives addresses from a per-chain index
    // counter in one shared wallet set, so the SAME address can belong to a
    // DIFFERENT user on a different chain (confirmed in live data). If you ever
    // add bridgeWallets / x402Wallet / gatewayWallet, or any non-Arc address, to
    // this registry, you MUST key by `${chain}:${address}` — otherwise credit
    // notifications silently go to the wrong user.
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

function observedRole(role: WalletRole): 'identity' | 'buyerAgent' | 'sellerAgent' {
  return role;
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

    // A transfer between tracked wallets must not create a duplicate
    // notification, but it still needs a ledger reconciliation pass below.
    // Route-specific writers normally record these transfers; the watcher is
    // the safety net when a route or worker failed after the chain transfer.
    const intraUserTransfer = !!(
      recipient && sender && recipient.owner === sender.owner
    );

    // Exact, as the token reports it. `amountUsdc` below is a Number for the
    // threshold comparison and the notification; anything written to the ledger
    // uses this string, so a deposit is never shown back to its owner rounded.
    const amountExact = formatUnits(value, USDC_DECIMALS);
    const amountUsdc = Number(amountExact);
    // The threshold is notification-only. Every non-zero token transfer still
    // enters the durable movement ledger; otherwise small but real fees,
    // rebates, or agent-wallet sweeps would disappear from the account's
    // financial history. A malformed numeric conversion is not safe to notify,
    // but it is still safe to reconcile using the exact token value below.
    const notifyable = Number.isFinite(amountUsdc) && amountUsdc >= MIN_NOTIFY_USDC;

    // A receipt hash is mandatory for a completed MoneyMovement. A malformed
    // provider log without one is not safe to project as a Karwan receipt.
    const txHash = log.transactionHash;
    if (!txHash) continue;
    const logIndex = log.logIndex ?? 0;
    const dedupeKey = `${txHash}:${logIndex}`;

    if (recipient) {
      // Do not notify twice for a route that already emits agent.funded or a
      // deal-specific event.  External/platform credits still get the normal
      // wallet notification.
      if (!intraUserTransfer && notifyable && rememberTransfer(`credit:${dedupeKey}`)) {
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
      }

      // Every tracked recipient is reconciled, including platform and
      // wallet-to-wallet sends. First match the exact receipt against any
      // durable movement; only an unclaimed transfer becomes an observed
      // deposit. This closes the gap where the notification arrived but the
      // route-specific writer failed after funds had already moved.
      const ledgerKey = `ledger:${observedArcDepositOperationKey(txHash, logIndex)}`;
      if (rememberTransfer(ledgerKey)) {
        void findMoneyMovementByTransferProof({
          txHash,
          sourceAddress: from,
          destinationAddress: recipient.address,
          amountMicros: value,
        })
          .then((existing) => {
            if (existing) return null;
            return recordObservedArcTransfer({
              txHash,
              logIndex,
              amountMicros: value,
              owner: recipient.owner,
              sourceAddress: from,
              destinationAddress: recipient.address,
              walletRole: observedRole(recipient.role),
              kind: intraUserTransfer ? 'agent_funding' : 'deposit',
            });
          })
          .then((movement) => {
            if (!movement) return;
            return appendActivity({
              id: `arc-credit:${dedupeKey}`,
              address: recipient.owner,
              kind: 'deposit',
              summary: movement.summary,
              amountUsdc: amountExact,
              txHash,
              refId: movement.reference,
            });
          })
          .catch((err) => {
            // Allow a later poll/replay to retry a transient database error.
            seenTransfers.delete(ledgerKey);
            logger.warn(
              { err: (err as Error).message, txHash, logIndex },
              'balance watcher: observed credit ledger write failed',
            );
          });
      }
      continue;
    }

    if (sender) {
      if (!rememberTransfer(`debit:${dedupeKey}`)) continue;
      if (notifyable) bus.emitEvent({
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

      // A route-specific movement normally owns this receipt. If it did not
      // survive after the transfer, preserve the exact debit rather than
      // leaving the agent wallet's outflow invisible. Same-owner transfers are
      // represented once on the recipient pass as agent_funding, avoiding a
      // synthetic + / - pair for an internal move.
      if (!intraUserTransfer) {
        const ledgerKey = `ledger:debit:${dedupeKey}`;
        if (rememberTransfer(ledgerKey)) {
          void findMoneyMovementByTransferProof({
            txHash,
            sourceAddress: sender.address,
            destinationAddress: to,
            amountMicros: value,
          })
            .then((existing) => {
              if (existing) return null;
              return recordObservedArcTransfer({
                txHash,
                logIndex,
                amountMicros: value,
                owner: sender.owner,
                sourceAddress: sender.address,
                destinationAddress: to,
                walletRole: observedRole(sender.role),
                kind: 'cash_out',
              });
            })
            .then((movement) => {
              if (!movement) return;
              return appendActivity({
                id: `arc-debit:${dedupeKey}`,
                address: sender.owner,
                kind: 'withdraw',
                summary: movement.summary,
                amountUsdc: amountExact,
                txHash,
                refId: movement.reference,
              });
            })
            .catch((err) => {
              seenTransfers.delete(ledgerKey);
              logger.warn(
                { err: (err as Error).message, txHash, logIndex },
                'balance watcher: observed debit ledger write failed',
              );
            });
        }
      }
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
    recordHeartbeat('balanceWatcher');
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
