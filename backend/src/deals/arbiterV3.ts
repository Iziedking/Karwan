import { keccak256, toBytes } from 'viem';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { EvidenceReceiptState } from '../chain/evidenceReceipt.js';

/// The automatic arbiter for KarwanDealEscrow (v3) disputes.
///
/// It reads only what is on the record (the escrow's delivery, clock and check
/// state, and who disputed) and applies a fixed table the user approved on
/// 2026-09-25 (audit/DEAL_ESCROW_V3_INTEGRATION.md section 7). It proposes all
/// or nothing, never a partial split; anything outside the table goes to people.
/// A proposal only takes effect after the appeal window, and either side can
/// escalate to admin review before then. No model output feeds a ruling.

type Hex = `0x${string}`;

export interface ArbiterInput {
  view: DealV3View;
  /// From the deal's terms: the seller's last chance after the deadline.
  reclaimGraceSecs: number;
  nowSecs: number;
  disputedBy: 'buyer' | 'seller' | null;
  /// The delivery revision a failed check was attested for, if any.
  checkFailedRevision?: number;
}

export type ArbiterRuling =
  | { kind: 'propose'; sellerBps: 0 | 10_000; ruleId: 'R1-no-delivery' | 'R2-checked-delivery' | 'R3-check-failed'; reason: string }
  | { kind: 'escalate'; ruleId: 'R4-refer'; reason: string }
  | { kind: 'wait'; reason: string };

export function decideRuling(input: ArbiterInput): ArbiterRuling {
  const { view, nowSecs } = input;
  const delivered = view.deliveredAt !== 0n;

  if (!delivered) {
    if (view.deadline === 0n) {
      return { kind: 'escalate', ruleId: 'R4-refer', reason: 'nothing delivered on a deal with no deadline' };
    }
    if (BigInt(nowSecs) <= view.deadline + BigInt(input.reclaimGraceSecs)) {
      return { kind: 'wait', reason: 'the seller can still deliver inside the grace window' };
    }
    return {
      kind: 'propose',
      sellerBps: 0,
      ruleId: 'R1-no-delivery',
      reason: 'nothing was delivered and the deadline and grace passed',
    };
  }

  if (input.checkFailedRevision !== undefined && input.checkFailedRevision === view.revision) {
    return {
      kind: 'propose',
      sellerBps: 0,
      ruleId: 'R3-check-failed',
      reason: 'the delivery check failed on the delivery under dispute',
    };
  }

  if (view.checkPassed && !view.lateMark && input.disputedBy === 'buyer') {
    return {
      kind: 'propose',
      sellerBps: 10_000,
      ruleId: 'R2-checked-delivery',
      reason: 'delivered on time and the delivery check passed',
    };
  }

  return { kind: 'escalate', ruleId: 'R4-refer', reason: 'the record does not settle this dispute on its own' };
}

export interface RulingRecord {
  dealKey: string;
  ruleId: string;
  sellerBps: number | null;
  reason: string;
  inputs: {
    revision: number;
    deliveredAt: string;
    lateMark: boolean;
    checkPassed: boolean;
    checkFailedRevision: number | null;
    deadline: string;
    disputedAt: string;
    disputedBy: 'buyer' | 'seller' | null;
    decidedAt: number;
  };
  rulingHash: Hex;
}

/// The public record of a ruling. Its hash goes on-chain with the proposal, so
/// anyone holding the record can check it is the one the escrow applied.
export function rulingRecord(ruling: ArbiterRuling, input: ArbiterInput, dealKey: string): RulingRecord {
  const body = {
    dealKey,
    ruleId: ruling.kind === 'wait' ? 'wait' : ruling.ruleId,
    sellerBps: ruling.kind === 'propose' ? ruling.sellerBps : null,
    reason: ruling.reason,
    inputs: {
      revision: input.view.revision,
      deliveredAt: input.view.deliveredAt.toString(),
      lateMark: input.view.lateMark,
      checkPassed: input.view.checkPassed,
      checkFailedRevision: input.checkFailedRevision ?? null,
      deadline: input.view.deadline.toString(),
      disputedAt: input.view.disputedAt.toString(),
      disputedBy: input.disputedBy,
      decidedAt: input.nowSecs,
    },
  };
  return { ...body, rulingHash: keccak256(toBytes(JSON.stringify(body))) };
}

export interface DisputeClocks {
  /// Time the parties get to settle it themselves before the arbiter acts.
  coolOffSecs: number;
  appealWindowSecs: number;
  disputeTimeoutSecs: number;
}

export type DisputeStep = 'cooling-off' | 'decide' | 'appeal-open' | 'execute' | 'with-review' | 'lapse' | 'none';

/// What the watcher should do next for a disputed v3 deal.
export function disputeStep(view: DealV3View, nowSecs: number, clocks: DisputeClocks): DisputeStep {
  if (view.state !== DEAL_STATE.Disputed) return 'none';
  const now = BigInt(nowSecs);
  if (now >= view.disputedAt + BigInt(clocks.disputeTimeoutSecs)) return 'lapse';
  if (view.escalated) return 'with-review';
  if (view.proposal) {
    return now >= view.proposedAt + BigInt(clocks.appealWindowSecs) ? 'execute' : 'appeal-open';
  }
  return now >= view.disputedAt + BigInt(clocks.coolOffSecs) ? 'decide' : 'cooling-off';
}

export interface ReceiptFacts {
  state: EvidenceReceiptState;
  evidenceRevision?: number;
  verdictCommitment?: Hex;
}

/// The on-chain attestation a delivery-check receipt supports, or null. Only a
/// final pass or mismatch from the evidence registry counts, only for the
/// delivery the escrow is looking at, and only once.
export function attestationFor(
  receipt: ReceiptFacts,
  dealDeliveryRevision: number | undefined,
  view: DealV3View,
): { pass: boolean; evidenceHash: Hex; revision: number } | null {
  if (view.state !== DEAL_STATE.Accepted || view.deliveredAt === 0n || view.checkPassed) return null;
  if (receipt.state !== 'pass' && receipt.state !== 'mismatch') return null;
  if (!receipt.verdictCommitment) return null;
  if (receipt.evidenceRevision !== dealDeliveryRevision || dealDeliveryRevision !== view.revision) return null;
  return { pass: receipt.state === 'pass', evidenceHash: receipt.verdictCommitment, revision: view.revision };
}

/// What a split at `sellerBps` pays each side, exactly as the escrow's _split
/// does: the seller gets that share of their unpaid net; the buyer gets the
/// rest of it plus the unreleased fee not taken on the seller's share.
export function splitMicros(
  view: Pick<DealV3View, 'sellerNet' | 'released' | 'feeTotal' | 'feeReleased'>,
  sellerBps: number,
): { toSeller: bigint; toBuyer: bigint; fee: bigint } {
  const net = view.sellerNet - view.released;
  const fee = view.feeTotal - view.feeReleased;
  const toSeller = (net * BigInt(sellerBps)) / 10_000n;
  const feeCut = (fee * BigInt(sellerBps)) / 10_000n;
  return { toSeller, toBuyer: net - toSeller + (fee - feeCut), fee: feeCut };
}
