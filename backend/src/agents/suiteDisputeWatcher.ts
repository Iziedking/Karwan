import { encodeFunctionData } from 'viem';
import { agreementEscrowAbi } from '../chain/abis/agreementEscrow.js';
import type { AgreementEscrow } from '../chain/agreementEscrow.js';
import type { StoredAgreementTerms } from '../chain/agreementTerms.js';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { EvidenceReceiptView } from '../chain/evidenceReceipt.js';
import type { PlatformSigners } from '../chain/platformSigners.js';
import type { DirectDeal } from '../db/deals.js';
import { attestationFor, decideRuling, rulingRecord, type ArbiterRuling } from '../deals/arbiterV3.js';
import { BUYER_ANSWER_MS } from '../deals/buyerSilence.js';

/// The deal watcher's escrow-family half: delivery checks signed by two of
/// Karwan's three checkers, and the dispute table of 25 Sep on the Agreement
/// escrow. Karwan's arbiter key proposes or escalates; after the 72-hour appeal
/// window anyone carries the proposal out; an escalated dispute belongs to the
/// review Safe the deal was opened with, and if it misses its 5 days the terms'
/// fallback share applies. Every step re-reads the escrow first.

type Hex = `0x${string}`;

/// DisputeLib's fixed windows.
const APPEAL_WINDOW_SECS = 72 * 3600;
const RULING_PERIOD_SECS = 5 * 86_400;

export interface SuiteWatcherDeps {
  /// Calls anyone may make; the buying agent signs them.
  escrow: Pick<AgreementEscrow, 'executeRuling' | 'applyFallback'>;
  /// Karwan's arbiter and checker keys, or null where they are not configured.
  arbiter: Pick<PlatformSigners, 'arbiterSend' | 'submitCheck'> | null;
  readView(deal: DirectDeal): Promise<DealV3View>;
  readEscalatedAt(deal: DirectDeal): Promise<bigint>;
  readReceipt(deal: DirectDeal): Promise<EvidenceReceiptView>;
  /// Time the parties get to settle it themselves before the arbiter acts.
  coolOffSecs: number;
  patchDeal(jobId: string, patch: Partial<DirectDeal>): Promise<unknown>;
  emit(e: { type: string; jobId: string; actor: 'buyer' | 'seller' | 'platform'; payload: Record<string, unknown> }): void;
  alertOperator(deal: DirectDeal, message: string): Promise<void>;
  warn(context: Record<string, unknown>, message: string): void;
}

export type SuiteDisputeStep = 'cooling-off' | 'decide' | 'appeal-open' | 'execute' | 'with-review' | 'fallback' | 'none';

export function suiteDisputeStep(view: DealV3View, escalatedAt: bigint, nowSecs: number, coolOffSecs: number): SuiteDisputeStep {
  if (view.state !== DEAL_STATE.Disputed) return 'none';
  const now = BigInt(nowSecs);
  if (view.escalated) return now >= escalatedAt + BigInt(RULING_PERIOD_SECS) ? 'fallback' : 'with-review';
  if (view.proposal) return now >= view.proposedAt + BigInt(APPEAL_WINDOW_SECS) ? 'execute' : 'appeal-open';
  return now >= view.disputedAt + BigInt(coolOffSecs) ? 'decide' : 'cooling-off';
}

function idOf(deal: DirectDeal): Hex {
  if (!deal.escrowDealId) throw new Error(`suite deal ${deal.jobId} has no escrow deal id`);
  return deal.escrowDealId as Hex;
}

/// Report a final delivery-check result for the delivery the escrow shows.
export async function runSuiteCheck(deps: SuiteWatcherDeps, deal: DirectDeal): Promise<void> {
  if (!deps.arbiter || !deal.delivered) return;
  const view = await deps.readView(deal);
  if (deal.v3AttestedRevision === view.revision) return;
  const attestation = attestationFor(await deps.readReceipt(deal), deal.deliveryRevision, view);
  if (!attestation) return;
  await deps.arbiter.submitCheck({ dealId: idOf(deal), revision: attestation.revision, pass: attestation.pass, evidenceHash: attestation.evidenceHash });
  await deps.patchDeal(deal.jobId, {
    v3AttestedRevision: attestation.revision,
    ...(attestation.pass ? {} : { v3CheckFailedRevision: attestation.revision }),
  });
}

/// The record after a ruling: a ruling on an earlier tranche pays it and the
/// deal carries on; on the last tranche the deal ends.
async function recordRuling(deps: SuiteWatcherDeps, deal: DirectDeal, sellerBps: number, reason: string, nowMs: number) {
  const after = await deps.readView(deal);
  const common = { disputed: false, resolvedSellerBps: sellerBps, disputeLoser: sellerBps >= 5000 ? ('buyer' as const) : ('seller' as const) };
  if (after.state === DEAL_STATE.Accepted) {
    await deps.patchDeal(deal.jobId, { ...common, disputedAt: undefined, disputedBy: undefined });
  } else {
    await deps.patchDeal(deal.jobId, {
      ...common,
      ...(sellerBps > 0 ? { settledAt: nowMs } : { cancelledAt: nowMs }),
      cancelKind: 'resolved',
      cancelReason: reason,
    });
  }
  deps.emit({
    type: 'deal.dispute.auto_resolved',
    jobId: deal.jobId,
    actor: 'platform',
    payload: { buyer: deal.buyer, seller: deal.seller, sellerBps, rulingHash: deal.v3Ruling?.rulingHash },
  });
}

/// Move a disputed suite deal one step forward.
export async function runSuiteDispute(deps: SuiteWatcherDeps, deal: DirectDeal, nowMs: number): Promise<void> {
  const view = await deps.readView(deal);
  const nowSecs = Math.floor(nowMs / 1000);
  const id = idOf(deal);

  if (view.state === DEAL_STATE.Split || view.state === DEAL_STATE.Settled) {
    // Ruled elsewhere (the review Safe, or an agreed split): catch the record up.
    await deps.patchDeal(deal.jobId, { disputed: false, settledAt: deal.settledAt ?? nowMs, cancelKind: 'resolved' });
    return;
  }
  if (view.state === DEAL_STATE.Accepted) {
    // Closed on chain and the deal runs on (an earlier tranche ruled, or released).
    await deps.patchDeal(deal.jobId, { disputed: false, disputedAt: undefined, disputedBy: undefined });
    return;
  }

  // A buyer-silence dispute has no cool-off: the buyer already had their review time.
  const silent = deal.disputeKind === 'buyer-silent';
  const step = suiteDisputeStep(view, view.escalated ? await deps.readEscalatedAt(deal) : 0n, nowSecs, silent ? 0 : deps.coolOffSecs);
  switch (step) {
    case 'decide': {
      if (!deps.arbiter) return;
      const input = {
        view,
        reclaimGraceSecs: deal.escrowTerms?.reclaimGrace ?? 0,
        nowSecs,
        disputedBy: deal.disputedBy ?? null,
        checkFailedRevision: deal.v3CheckFailedRevision,
      };
      const ruling: ArbiterRuling = silent ? silenceRuling(deal, view) : decideRuling(input);
      if (ruling.kind === 'wait') return;
      const record = rulingRecord(ruling, input, deal.jobId);
      if (ruling.kind === 'propose') {
        await deps.arbiter.arbiterSend('proposeRuling', [id, ruling.sellerBps, record.rulingHash]);
        if (silent) {
          // The contract's appeal window is the buyer's time to answer with a reason.
          deps.emit({
            type: 'deal.buyer_silent',
            jobId: deal.jobId,
            actor: 'platform',
            payload: { buyer: deal.buyer, seller: deal.seller, stage: 'answer', answerBy: nowMs + BUYER_ANSWER_MS },
          });
        }
      } else {
        await deps.arbiter.arbiterSend('escalate', [id]);
        await deps.alertOperator(deal, `Dispute on deal ${deal.jobId.slice(0, 10)}… needs the review Safe: ${ruling.reason}.`);
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
      if (!deal.buyerAgentWalletId) return;
      await deps.escrow.executeRuling({ walletId: deal.buyerAgentWalletId, jobId: id, dealKey: deal.jobId });
      await recordRuling(deps, deal, view.proposedBps, deal.v3Ruling?.reason ?? 'automatic ruling applied after the appeal window', nowMs);
      return;
    }
    case 'fallback': {
      if (!deal.buyerAgentWalletId) return;
      await deps.escrow.applyFallback({ walletId: deal.buyerAgentWalletId, jobId: id, dealKey: deal.jobId });
      const bps = (deal.escrowTerms as StoredAgreementTerms | undefined)?.fallbackBps ?? 5000;
      await recordRuling(deps, deal, bps, 'the review period ended without a ruling, so the agreed fallback share applied', nowMs);
      return;
    }
    case 'with-review': {
      if (deal.disputeTimeoutAlertedAt) return;
      await deps.patchDeal(deal.jobId, { disputeTimeoutAlertedAt: nowMs });
      await deps.alertOperator(deal, `Dispute on deal ${deal.jobId.slice(0, 10)}… was escalated and needs the review Safe.`);
      return;
    }
    default:
      return;
  }
}

/// Rule R5 (owner, 24 Oct 2026): a seller asked for payment after the buyer let
/// the review period pass in silence. Paid to the seller unless the buyer answers
/// within 72 hours; a failed check on that delivery goes to people instead.
function silenceRuling(deal: DirectDeal, view: DealV3View): ArbiterRuling {
  if (deal.v3CheckFailedRevision === view.revision) {
    return { kind: 'escalate', ruleId: 'R4-refer', reason: 'the seller asked for payment on a delivery whose check failed' };
  }
  return { kind: 'propose', sellerBps: 10_000, ruleId: 'R5-buyer-silent', reason: 'the buyer did not respond after the review period' };
}

export type SuiteRuleCall =
  | { ok: true; safe: Hex; to: Hex; data: Hex }
  | { ok: false; status: 409; error: string; code: 'not-disputed' | 'not-escalated' };

/// The review Safe's `rule` call for an escalated suite dispute, for its
/// owners to sign. The Safe is the deal's own panel reviewer, fixed at funding.
export function suiteRuleCall(input: { view: DealV3View; reviewer: Hex; agreement: Hex; dealId: Hex; sellerBps: number; rulingHash: Hex }): SuiteRuleCall {
  if (input.view.state !== DEAL_STATE.Disputed) return { ok: false, status: 409, error: 'the escrow is not in dispute', code: 'not-disputed' };
  if (!input.view.escalated) {
    return {
      ok: false,
      status: 409,
      error: 'this dispute has not been escalated to the review Safe; the automatic ruling and appeal window come first',
      code: 'not-escalated',
    };
  }
  return {
    ok: true,
    safe: input.reviewer,
    to: input.agreement,
    data: encodeFunctionData({ abi: agreementEscrowAbi, functionName: 'rule', args: [input.dealId, input.sellerBps, input.rulingHash] }),
  };
}
