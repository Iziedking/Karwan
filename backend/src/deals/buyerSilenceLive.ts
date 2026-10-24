import { agreementEscrowAddress, readAgreementReviewEnd, readAgreementView } from '../chain/agreementEscrowLive.js';
import { patchDeal } from '../db/deals.js';
import { bus } from '../events.js';
import { BUYER_SILENT_REASON, type BuyerSilenceDeps } from './buyerSilence.js';
import { dealEscrowOps } from './dealEscrowOpsLive.js';

type Hex = `0x${string}`;

/// Live dependencies for the buyer-silence step, or null where the escrow family is not set up.
export function buyerSilenceDeps(): BuyerSilenceDeps | null {
  if (!agreementEscrowAddress) return null;
  const address = agreementEscrowAddress;
  return {
    readView: (deal) => readAgreementView(address, deal.escrowDealId as Hex),
    readReviewEnd: (deal) => readAgreementReviewEnd(address, deal.escrowDealId as Hex),
    raise: async (deal) => {
      if (!deal.sellerAgentWalletId) throw new Error(`deal ${deal.jobId} has no selling agent on record`);
      await dealEscrowOps.dispute(deal, deal.sellerAgentWalletId, BUYER_SILENT_REASON);
    },
    patchDeal: (jobId, patch) => patchDeal(jobId, patch),
    emit: (e) => bus.emitEvent(e),
  };
}
