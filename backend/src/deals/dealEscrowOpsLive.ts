import type { Address } from 'viem';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { escrow, invalidateEscrowCache, readEscrow } from '../chain/contracts.js';
import { dealEscrowV3, dealEscrowV3Address, readDealV3, readReviewEndV3 } from '../chain/dealEscrowV3Live.js';
import {
  acceptEscrow,
  claimMilestone,
  disputeEscrow,
  lapseDispute,
  mutualCancelOnChain,
  extendDeadlineOnChain,
  finalizeIfSettled,
  guardianAttestDelivery,
  guardianHold,
  guardianReleaseHold,
  markDeliveredOnChain,
  reclaimAfterDeadline,
  releaseMilestone,
} from '../chain/settlement.js';
import { createDealEscrowOps, type DealEscrowRef } from './dealEscrowOps.js';

function v3Address(): Address {
  if (!dealEscrowV3Address) throw new Error('KARWAN_DEAL_ESCROW_ADDR is not set');
  return dealEscrowV3Address;
}

/// The escrow operations every route and watcher uses for a deal.
export const dealEscrowOps = createDealEscrowOps({
  v3: dealEscrowV3,
  readV3: (id) => readDealV3(v3Address(), id),
  readV3ReviewEnd: (id) => readReviewEndV3(v3Address(), id),
  guardianWalletId: config.GUARDIAN_WALLET_ID,
  v2OnChainClock: config.ESCROW_V2B_ENABLED,
  v2: {
    readEscrow,
    invalidate: invalidateEscrowCache,
    accept: acceptEscrow,
    markDelivered: markDeliveredOnChain,
    release: releaseMilestone,
    claim: claimMilestone,
    extendDeadline: extendDeadlineOnChain,
    reclaim: reclaimAfterDeadline,
    finalizeIfSettled,
    attest: guardianAttestDelivery,
    dispute: disputeEscrow,
    lapseDispute,
    mutualCancel: mutualCancelOnChain,
    hold: guardianHold,
    releaseHold: guardianReleaseHold,
  },
  warn: (context, message) => logger.warn(context, message),
});

/// The escrow contract that holds this deal's money.
export function escrowAddressOf(deal: DealEscrowRef & { escrowAddress?: string }): string {
  return dealEscrowOps.isV3(deal) && deal.escrowAddress ? deal.escrowAddress : escrow.address;
}
