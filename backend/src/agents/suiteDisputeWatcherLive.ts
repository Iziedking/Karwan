import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { agreementEscrow, agreementEscrowAddress, readAgreementEscalatedAt, readAgreementView } from '../chain/agreementEscrowLive.js';
import { readEvidenceReceipt } from '../chain/evidenceReceipt.js';
import { platformSigners } from '../chain/platformSignersLive.js';
import { patchDeal, type DirectDeal } from '../db/deals.js';
import { sendTelegramMessage, supportOperatorChatId } from '../telegram/bot.js';
import type { SuiteWatcherDeps } from './suiteDisputeWatcher.js';

type Hex = `0x${string}`;

/// Live dependencies for the escrow-family half of the deal watcher, or null
/// where the family is not configured on this network.
export function suiteWatcherDeps(): SuiteWatcherDeps | null {
  if (!agreementEscrow || !agreementEscrowAddress) return null;
  const address = agreementEscrowAddress;
  const escrow = agreementEscrow;
  return {
    escrow: { executeRuling: (a) => escrow.executeRuling(a), applyFallback: (a) => escrow.applyFallback(a) },
    arbiter: platformSigners,
    readView: (deal) => readAgreementView(address, deal.escrowDealId as Hex),
    readEscalatedAt: (deal) => readAgreementEscalatedAt(address, deal.escrowDealId as Hex),
    readReceipt: (deal: DirectDeal) =>
      readEvidenceReceipt(deal.jobId, deal.agreementVersion ?? 1, {
        evidenceRevision: deal.deliveryRevision,
        evidenceCommitment: deal.evidenceExpectedCommitment,
        reportId: deal.creEvidenceReceipt?.reportId,
        requireBinding: deal.evidenceRequired === true,
      }),
    coolOffSecs: Math.floor(config.V3_ARBITER_COOL_OFF_MS / 1000),
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
        logger.warn({ err: (err as Error).message }, 'suite dispute alert send failed'),
      );
    },
    warn: (context, message) => logger.warn(context, message),
  };
}
