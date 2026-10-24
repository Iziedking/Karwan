import { decodeEventLog, erc20Abi, type Hex } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { publicClient } from '../chain/client.js';
import { transferFromCircleWallet } from '../chain/usdc3009.js';
import { getDeal, listAllDeals, patchDeal } from '../db/deals.js';
import { bus } from '../events.js';
import { createSuiteEarnings, type TransferProof } from './suiteEarnings.js';

const RETRY_TICK_MS = 5 * 60_000;

async function transferProof(txHash: string, move: { from: string; to: string; amountMicros: bigint }): Promise<TransferProof> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex }).catch(() => null);
  if (!receipt) return 'unknown';
  if (receipt.status !== 'success') return 'reverted';
  const moved = receipt.logs.some((log) => {
    if (log.address.toLowerCase() !== config.USDC_ADDR.toLowerCase()) return false;
    try {
      const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      return (
        ev.eventName === 'Transfer' &&
        ev.args.from.toLowerCase() === move.from.toLowerCase() &&
        ev.args.to.toLowerCase() === move.to.toLowerCase() &&
        ev.args.value === move.amountMicros
      );
    } catch {
      return false;
    }
  });
  // A successful transaction without the transfer is not something to send again.
  return moved ? 'landed' : 'unknown';
}

export const suiteEarnings = createSuiteEarnings({
  getDeal,
  saveMove: async (jobId, key, move) => {
    const deal = await getDeal(jobId);
    if (!deal) return;
    await patchDeal(jobId, { suiteEarnings: { ...(deal.suiteEarnings ?? {}), [key]: move } });
  },
  listDeals: async () =>
    (await listAllDeals()).filter((d) => d.escrowVersion === 'suite' && Object.values(d.suiteEarnings ?? {}).some((m) => m.state === 'pending')),
  transfer: ({ walletId, to, amountMicros, idempotencyKey }) =>
    transferFromCircleWallet(walletId, to, amountMicros.toString(), 'Karwan earnings to your wallet', idempotencyKey),
  transferProof,
  now: () => Date.now(),
  log: (context, message) => logger.warn(context, message),
});

/// Moves each suite payout on as it lands, and walks pending moves every few minutes.
export function startSuiteEarnings(): () => void {
  const unsubscribe = bus.subscribe((event) => {
    if (event.type !== 'escrow.milestone.released' && event.type !== 'escrow.seller.paid') return;
    suiteEarnings.onPayout(event).catch((err) => logger.error({ jobId: event.jobId, err: (err as Error).message }, 'earnings move failed'));
  });
  const id = setInterval(() => {
    suiteEarnings.retryPending().catch((err) => logger.error({ err: (err as Error).message }, 'earnings retry failed'));
  }, RETRY_TICK_MS);
  return () => {
    unsubscribe();
    clearInterval(id);
  };
}
