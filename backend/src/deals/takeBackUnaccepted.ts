import { getAgentWallets } from '../db/agentWallets.js';
import { appendActivity } from '../db/activityLog.js';
import { patchDeal, type DirectDeal } from '../db/deals.js';
import { bus } from '../events.js';
import { ensureEscrowRefundMovement, executeEscrowRefundMovement } from '../money/escrowRefund.js';
import { formatUsdcMicros } from '../money/model.js';
import { dealEscrowOps, escrowAddressOf } from './dealEscrowOpsLive.js';

export const refundMovementKey = (jobId: string) => `escrow_refund:${jobId.toLowerCase()}`;

export class TakeBackRefused extends Error {
  constructor(readonly code: 'NO_BUYER_AGENT' | 'ESCROW_EMPTY', message: string) {
    super(message);
  }
}

/// Returns money the escrow holds for a deal the seller never accepted to the
/// buyer's agent, records it, and tells both sides. The buyer asks for it from
/// the deal page; the watcher does it once the accept window has closed.
export async function takeBackUnaccepted(
  deal: DirectDeal,
  account: Awaited<ReturnType<typeof dealEscrowOps.read>>,
  opts: { actor: 'buyer' | 'platform'; reason: string; extra?: Partial<DirectDeal> },
): Promise<{ txHash?: string; reference: string }> {
  const jobId = deal.jobId;
  if (!deal.buyerAgentWalletId) throw new TakeBackRefused('NO_BUYER_AGENT', 'this deal has no buyer agent wallet on record');
  const buyerAgentAddress = deal.buyerAgentAddress ?? (await getAgentWallets(deal.buyer))?.buyerAddress;
  if (!buyerAgentAddress) throw new TakeBackRefused('NO_BUYER_AGENT', 'this deal has no buyer agent address on record');
  const refundMicros = dealEscrowOps.refundableMicros(account) ?? 0n;
  if (refundMicros <= 0n) throw new TakeBackRefused('ESCROW_EMPTY', 'there is no remaining escrow to refund');
  const refundAmountUsdc = formatUsdcMicros(refundMicros);
  const refundInput = {
    operationKey: refundMovementKey(jobId),
    amountUsdc: refundAmountUsdc,
    initiatedBy: deal.buyer,
    buyerAgentAddress,
    sellerAddress: deal.seller,
    jobId,
    summary: `Took back ${refundAmountUsdc} USDC from a deal the seller never accepted`,
    escrowAddress: escrowAddressOf(deal),
    buyerAgentWalletId: deal.buyerAgentWalletId,
  };
  await ensureEscrowRefundMovement(refundInput);
  const refundResult = await executeEscrowRefundMovement(refundInput, (options) =>
    dealEscrowOps.cancelUnaccepted(deal, deal.buyerAgentWalletId!, options),
  );
  await patchDeal(jobId, {
    cancelledAt: Date.now(),
    cancelKind: 'pre-accept',
    cancelReason: opts.reason,
    refundTxHash: refundResult.txHash,
    ...opts.extra,
  });
  void appendActivity({
    address: deal.buyer,
    kind: 'refund',
    id: `escrow-refund:${jobId}`,
    refId: refundResult.movement.reference,
    summary: refundInput.summary,
    amountUsdc: refundAmountUsdc,
    txHash: refundResult.txHash,
    jobId,
    counterparty: deal.seller?.toLowerCase(),
  });
  bus.emitEvent({
    type: 'deal.cancelled',
    jobId,
    actor: opts.actor,
    payload: {
      buyer: deal.buyer,
      seller: deal.seller,
      kind: 'pre-accept',
      reason: opts.reason,
      txHash: refundResult.txHash,
      reference: refundResult.movement.reference,
    },
  });
  return { txHash: refundResult.txHash, reference: refundResult.movement.reference };
}
