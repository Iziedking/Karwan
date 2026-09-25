import { DEAL_STATE, type DealEscrowV3, type DealV3View } from '../chain/dealEscrowV3.js';
import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import type { DirectDeal } from '../db/deals.js';
import {
  attestationFor,
  decideRuling,
  disputeStep,
  rulingRecord,
  type DisputeClocks,
  type RulingRecord,
} from '../deals/arbiterV3.js';

/// The deal watcher's v3 half: delivery-check attestations from the evidence
/// registry, and the dispute lifecycle (automatic proposal or escalation,
/// execution after the appeal window, lapse after the timeout). Every step
/// re-reads the escrow first and is safe to run again on the next tick.

type Hex = `0x${string}`;

export interface V3WatcherDeps {
  escrow: DealEscrowV3;
  readView(deal: DirectDeal): Promise<DealV3View>;
  readReceipt(deal: DirectDeal): Promise<EvidenceReceiptView>;
  clocks(): Promise<DisputeClocks>;
  /// The wallet the escrow knows as its automatic arbiter; unset disables
  /// proposals (either side can still escalate after the SLA, and lapse).
  arbiterWalletId?: string;
  guardianWalletId?: string;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  emit(e: { type: string; jobId: string; actor: 'buyer' | 'seller' | 'platform'; payload: Record<string, unknown> }): void;
  alertOperator(deal: DirectDeal, message: string): Promise<void>;
  warn(context: Record<string, unknown>, message: string): void;
}

function refOf(deal: DirectDeal): { id: Hex; dealKey: string } {
  if (!deal.escrowDealId) throw new Error(`v3 deal ${deal.jobId} has no escrow deal id`);
  return { id: deal.escrowDealId as Hex, dealKey: deal.jobId };
}

/// Attest a final delivery-check result for the delivery the escrow shows.
export async function runV3Attestation(deps: V3WatcherDeps, deal: DirectDeal): Promise<void> {
  if (!deps.guardianWalletId || !deal.delivered) return;
  const view = await deps.readView(deal);
  if (deal.v3AttestedRevision === view.revision) return;
  const receipt = await deps.readReceipt(deal);
  const attestation = attestationFor(receipt, deal.deliveryRevision, view);
  if (!attestation) return;
  const { id, dealKey } = refOf(deal);
  await deps.escrow.attestCheck({
    walletId: deps.guardianWalletId,
    jobId: id,
    revision: attestation.revision,
    pass: attestation.pass,
    evidenceHash: attestation.evidenceHash,
    dealKey,
  });
  await deps.patchDeal(deal.jobId, {
    v3AttestedRevision: attestation.revision,
    ...(attestation.pass ? {} : { v3CheckFailedRevision: attestation.revision }),
  });
}

/// Move a disputed v3 deal one step forward.
export async function runV3Dispute(deps: V3WatcherDeps, deal: DirectDeal, nowMs: number): Promise<void> {
  const view = await deps.readView(deal);
  const nowSecs = Math.floor(nowMs / 1000);
  const { id, dealKey } = refOf(deal);

  if (view.state === DEAL_STATE.Split || view.state === DEAL_STATE.Settled) {
    // Ruled elsewhere (admin review, or an agreed split): catch the record up.
    await deps.patchDeal(deal.jobId, { disputed: false, settledAt: deal.settledAt ?? nowMs, cancelKind: 'resolved' });
    return;
  }
  if (view.state === DEAL_STATE.Accepted) {
    // Lapsed on-chain (by either side): the deal runs on.
    await deps.patchDeal(deal.jobId, { disputed: false, disputedAt: undefined, disputedBy: undefined });
    return;
  }

  const step = disputeStep(view, nowSecs, await deps.clocks());
  switch (step) {
    case 'decide': {
      if (!deps.arbiterWalletId) return;
      const input = {
        view,
        reclaimGraceSecs: deal.escrowTerms?.reclaimGrace ?? 0,
        nowSecs,
        disputedBy: deal.disputedBy ?? null,
        checkFailedRevision: deal.v3CheckFailedRevision,
      };
      const ruling = decideRuling(input);
      if (ruling.kind === 'wait') return;
      const record = rulingRecord(ruling, input, deal.jobId);
      if (ruling.kind === 'propose') {
        await deps.escrow.proposeRuling({
          walletId: deps.arbiterWalletId,
          jobId: id,
          sellerBps: ruling.sellerBps,
          rulingHash: record.rulingHash,
          dealKey,
        });
      } else {
        await deps.escrow.escalate({ walletId: deps.arbiterWalletId, jobId: id, dealKey });
        await deps.alertOperator(deal, `Dispute on deal ${deal.jobId.slice(0, 10)}… needs admin review: ${ruling.reason}.`);
        deps.emit({
          type: 'deal.dispute.needs_arbiter',
          jobId: deal.jobId,
          actor: 'platform',
          payload: { buyer: deal.buyer, seller: deal.seller, reason: ruling.reason },
        });
      }
      await deps.patchDeal(deal.jobId, { v3Ruling: record });
      return;
    }
    case 'execute': {
      const walletId = deps.arbiterWalletId ?? deal.buyerAgentWalletId;
      if (!walletId) return;
      await deps.escrow.executeRuling({ walletId, jobId: id, dealKey });
      const sellerBps = view.proposedBps;
      await deps.patchDeal(deal.jobId, {
        disputed: false,
        ...(sellerBps > 0 ? { settledAt: nowMs } : { cancelledAt: nowMs }),
        cancelKind: 'resolved',
        cancelReason: deal.v3Ruling?.reason ?? 'automatic ruling applied after the appeal window',
        resolvedSellerBps: sellerBps,
        disputeLoser: sellerBps >= 5000 ? 'buyer' : 'seller',
      });
      deps.emit({
        type: 'deal.dispute.auto_resolved',
        jobId: deal.jobId,
        actor: 'platform',
        payload: { buyer: deal.buyer, seller: deal.seller, sellerBps, rulingHash: deal.v3Ruling?.rulingHash },
      });
      return;
    }
    case 'lapse': {
      // Nobody ruled in time: the deal goes back to where it was, with an
      // on-time delivery kept. Either party may do this; the buyer agent signs.
      if (!deal.buyerAgentWalletId) return;
      await deps.escrow.lapseDispute({ walletId: deal.buyerAgentWalletId, jobId: id, dealKey });
      await deps.patchDeal(deal.jobId, { disputed: false, disputedAt: undefined, disputedBy: undefined });
      deps.emit({
        type: 'deal.dispute.lapsed',
        jobId: deal.jobId,
        actor: 'platform',
        payload: { buyer: deal.buyer, seller: deal.seller },
      });
      return;
    }
    case 'with-review': {
      if (deal.disputeTimeoutAlertedAt) return;
      await deps.patchDeal(deal.jobId, { disputeTimeoutAlertedAt: nowMs });
      await deps.alertOperator(deal, `Dispute on deal ${deal.jobId.slice(0, 10)}… was escalated and needs admin review.`);
      return;
    }
    default:
      return;
  }
}

export type { RulingRecord };
