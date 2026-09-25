import type { Address } from 'viem';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { dealEscrowV3, dealEscrowV3Address, readDealV3, readDisputeClocksV3 } from '../chain/dealEscrowV3Live.js';
import { readEvidenceReceipt } from '../chain/evidenceReceipt.js';
import { patchDeal, type DirectDeal } from '../db/deals.js';
import type { DisputeClocks } from '../deals/arbiterV3.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import type { V3WatcherDeps } from './v3DisputeWatcher.js';

async function readClocks(address: Address): Promise<DisputeClocks> {
  const c = await readDisputeClocksV3(address);
  return {
    coolOffSecs: Math.floor(config.V3_ARBITER_COOL_OFF_MS / 1000),
    appealWindowSecs: c.appealWindowSecs,
    disputeTimeoutSecs: c.disputeTimeoutSecs,
  };
}

/// Live dependencies for the v3 half of the deal watcher, or null when the v3
/// escrow is not configured on this network.
export function v3WatcherDeps(): V3WatcherDeps | null {
  if (!dealEscrowV3 || !dealEscrowV3Address) return null;
  const address = dealEscrowV3Address;
  return {
    escrow: dealEscrowV3,
    readView: (deal) => readDealV3(address, deal.escrowDealId as `0x${string}`),
    readReceipt: (deal: DirectDeal) =>
      readEvidenceReceipt(deal.jobId, deal.agreementVersion ?? 1, {
        evidenceRevision: deal.deliveryRevision,
        evidenceCommitment: deal.evidenceExpectedCommitment,
        reportId: deal.creEvidenceReceipt?.reportId,
        requireBinding: deal.evidenceRequired === true,
      }),
    clocks: () => readClocks(address),
    arbiterWalletId: config.AUTO_ARBITER_WALLET_ID,
    guardianWalletId: config.GUARDIAN_WALLET_ID,
    patchDeal: (jobId, patch) => patchDeal(jobId, patch),
    emit: (e) =>
      bus.emitEvent({
        type: e.type as Parameters<typeof bus.emitEvent>[0]['type'],
        jobId: e.jobId,
        actor: e.actor,
        payload: e.payload,
      }),
    async alertOperator(_deal, message) {
      const chat = supportOperatorChatId();
      if (!chat) return;
      await sendTelegramMessage(chat, message).catch((err) =>
        logger.warn({ err: (err as Error).message }, 'v3 dispute alert send failed'),
      );
    },
    warn: (context, message) => logger.warn(context, message),
  };
}
