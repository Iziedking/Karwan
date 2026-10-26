import { agreementEscrowAddress, readAgreementReviewEnd, readAgreementView } from '../chain/agreementEscrowLive.js';
import { patchDeal } from '../db/deals.js';
import { bus } from '../events.js';
import { settleFactoringForDeal } from '../agents/factoringWatcher.js';
import { settlePOFinancingForDeal } from '../agents/poWatcher.js';
import { dealEscrowOps } from './dealEscrowOpsLive.js';
import { recordSettlement } from './recordSettlement.js';
import type { SuiteReviewEndDeps } from './suiteReviewEnd.js';

type Hex = `0x${string}`;

/// Live dependencies for the review-end step, or null where the escrow family is not set up.
export function suiteReviewEndDeps(): SuiteReviewEndDeps | null {
  if (!agreementEscrowAddress) return null;
  const address = agreementEscrowAddress;
  return {
    readView: (deal) => readAgreementView(address, deal.escrowDealId as Hex),
    readReviewEnd: (deal) => readAgreementReviewEnd(address, deal.escrowDealId as Hex),
    claim: async (deal, index) => {
      if (!deal.sellerAgentWalletId) throw new Error(`deal ${deal.jobId} has no selling agent on record`);
      return dealEscrowOps.claim(deal, index, deal.sellerAgentWalletId);
    },
    recordSettlement: (deal) =>
      recordSettlement(deal, Date.now(), {
        finalize: (d) => dealEscrowOps.finalizeIfSettled(d),
        patch: patchDeal,
        settleFinancing: (id) => {
          void settleFactoringForDeal(id);
          void settlePOFinancingForDeal(id);
        },
      }),
    patchDeal: (jobId, patch) => patchDeal(jobId, patch),
    emit: (e) => bus.emitEvent(e),
  };
}
