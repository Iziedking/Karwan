import { formatUnits, keccak256, parseUnits, toHex } from 'viem';
import type { DealKind } from '../chain/agreementTerms.js';
import type { DirectDeal } from '../db/deals.js';
import type { MoneyMovement, MoneyMovementLeg } from '../money/model.js';
import { dealKindOf } from './dealKind.js';
import { dealReference } from './reference.js';

/// The deal record (view 94): one account of a finished deal, built only from
/// what the deal already stored. It reports what happened, including a stage
/// the review timer paid, and says "not recorded" (null) instead of guessing.

export type ConfirmedWay =
  | 'buyer_confirmed'
  | 'handover_code'
  | 'buyer_silent'
  | 'dispute'
  | 'review_window'
  | 'cancelled_by_both'
  | 'refunded'
  | 'not_recorded';

export interface DealRecordStage {
  index: number;
  confirmed: { way: ConfirmedWay; at: number | null; decidedBy?: 'finding' | 'panel' | 'agreed' | 'arbiter'; reason?: string };
  released: { sellerUsdc: string | null; refundUsdc: string; feeUsdc: string | null; at: number; tx: string | null; reference: string | null } | null;
}

export interface DealRecord {
  v: 1;
  jobId: string;
  reference: string;
  kind: DealKind;
  buyer: string;
  seller: string;
  agreed: { digest: string | null; buyerAt: number | null; sellerAt: number | null; title: string; priceUsdc: string };
  held: { usdc: string; at: number | null; tx: string | null; reference: string | null } | null;
  stages: DealRecordStage[];
  ended: 'settled' | 'refunded' | 'cancelled' | 'resolved';
  endedAt: number;
}

/// One stored deal event, as the event store returns it.
export interface DealEvent {
  type: string;
  ts: number;
  actor?: string;
  payload?: Record<string, unknown>;
}

const DECIMALS = 6;
const usdc = (micros: bigint): string => formatUnits(micros, DECIMALS);
const micros = (value: string): bigint => parseUnits(value, DECIMALS);

const DISPUTE_ENDS = new Set(['resolved', 'release-from-dispute', 'refund-from-dispute']);
const BOTH_CANCELLED = new Set(['mutual', 'platform-attributed']);

/// The share of the price each stage carries, in percent.
function stagePcts(deal: DirectDeal): number[] {
  if (deal.milestonePcts?.length) return deal.milestonePcts;
  return deal.firstReleasePct >= 100 ? [100] : [deal.firstReleasePct, 100 - deal.firstReleasePct];
}

/// The transaction of a movement: the last leg that carried one.
function legTx(legs: readonly MoneyMovementLeg[]): string | null {
  return [...legs].reverse().find((l) => l.txHash)?.txHash ?? null;
}

function stageIndex(event: DealEvent, key: 'milestoneIndex' | 'index'): number | null {
  const value = event.payload?.[key];
  return typeof value === 'number' ? value : null;
}

/// What was paid out for one stage: the payout movement first, the release
/// event when no movement was kept.
function stageRelease(i: number, grossMicros: bigint, movements: readonly MoneyMovement[], released: readonly DealEvent[]): DealRecordStage['released'] {
  const move = movements.find((m) => m.kind === 'milestone_payout' && m.state === 'completed' && m.milestoneIndex === i);
  if (move) {
    const seller = BigInt(move.amountMicros);
    return { sellerUsdc: usdc(seller), refundUsdc: '0', feeUsdc: usdc(grossMicros - seller), at: move.completedAt ?? move.updatedAt, tx: legTx(move.legs), reference: move.reference };
  }
  const event = released.find((e) => stageIndex(e, 'milestoneIndex') === i);
  if (!event) return null;
  const p = event.payload ?? {};
  const seller = typeof p.sellerMicros === 'string' ? BigInt(p.sellerMicros) : typeof p.amountUsdc === 'string' ? micros(p.amountUsdc) : null;
  return {
    sellerUsdc: seller === null ? null : usdc(seller),
    refundUsdc: '0',
    feeUsdc: seller === null ? null : usdc(grossMicros - seller),
    at: event.ts,
    tx: typeof p.txHash === 'string' ? p.txHash : null,
    reference: null,
  };
}

function decidedBy(deal: DirectDeal): DealRecordStage['confirmed']['decidedBy'] {
  if (deal.disputeReferredAt) return 'panel';
  if (deal.judgeProposal?.reviewedBy) return 'finding';
  if (deal.cancelKind === 'release-from-dispute' || deal.cancelKind === 'refund-from-dispute') return 'agreed';
  if (deal.cancelKind === 'resolved') return 'arbiter';
  return undefined;
}

function disputeConfirmed(deal: DirectDeal, at: number): DealRecordStage['confirmed'] {
  const by = decidedBy(deal);
  return { way: 'dispute', at, ...(by ? { decidedBy: by } : {}) };
}

/// Whether a dispute settled this deal: it was opened, and it ended in a
/// decision, an agreement on it, or a resolution event.
function disputeSettled(deal: DirectDeal, events: readonly DealEvent[]): boolean {
  if (!deal.disputedAt) return false;
  return DISPUTE_ENDS.has(deal.cancelKind ?? '') || events.some((e) => e.type === 'escrow.resolved' || e.type === 'deal.dispute.auto_resolved');
}

/// How one paid stage was confirmed, the first rule that matches (spec order).
function confirmedFor(
  deal: DirectDeal,
  i: number,
  final: boolean,
  release: DealRecordStage['released'],
  events: readonly DealEvent[],
  released: readonly DealEvent[],
  endedAt: number,
): DealRecordStage['confirmed'] {
  if (disputeSettled(deal, events) && (!release || release.at >= deal.disputedAt!)) return disputeConfirmed(deal, release?.at ?? endedAt);
  if (final && deal.handover?.usedAt) return { way: 'handover_code', at: deal.handover.usedAt };
  const timer = events.find((e) => e.type === 'deal.milestone.auto_released' && stageIndex(e, 'index') === i);
  if (timer) return { way: 'review_window', at: timer.ts };
  const event = released.find((e) => stageIndex(e, 'milestoneIndex') === i);
  if (event?.payload?.byClaim === true) {
    const asked = deal.buyerSilence?.raisedAt || deal.delayAppealRaisedAt;
    return { way: asked ? 'buyer_silent' : 'review_window', at: event.ts };
  }
  if (final && deal.autoReleasedAt && deal.delayAppealRaisedAt) return { way: 'buyer_silent', at: deal.autoReleasedAt };
  if (event?.actor === 'buyer') return { way: 'buyer_confirmed', at: event.ts };
  return { way: 'not_recorded', at: null };
}

function endedOf(deal: DirectDeal): DealRecord['ended'] {
  if (deal.cancelKind === 'resolved' || deal.cancelKind === 'release-from-dispute') return 'resolved';
  if (deal.settledAt) return 'settled';
  if (BOTH_CANCELLED.has(deal.cancelKind ?? '') || deal.cancelKind === 'pre-accept') return 'cancelled';
  return 'refunded';
}

/// The record of an ended deal, or null while it is still open.
export function buildDealRecord(deal: DirectDeal, movements: readonly MoneyMovement[], events: readonly DealEvent[]): DealRecord | null {
  const endedAt = deal.settledAt ?? deal.cancelledAt;
  if (!endedAt) return null;
  const ours = movements.filter((m) => !m.jobId || m.jobId.toLowerCase() === deal.jobId.toLowerCase());
  const released = events.filter((e) => e.type === 'escrow.milestone.released');
  const total = micros(deal.dealAmountUsdc);
  const pcts = stagePcts(deal);
  const gross = (i: number) => (total * BigInt(Math.round((pcts[i] ?? 0) * 100))) / 10_000n;

  const funding = ours.find((m) => m.kind === 'escrow_funding' && m.state === 'completed');
  const held: DealRecord['held'] = funding
    ? { usdc: usdc(BigInt(funding.amountMicros)), at: funding.completedAt ?? funding.updatedAt, tx: legTx(funding.legs), reference: funding.reference }
    : deal.fundTxHash
      ? { usdc: deal.dealAmountUsdc, at: null, tx: deal.fundTxHash, reference: null }
      : null;

  const stages: DealRecordStage[] = [];
  if (deal.settledAt) {
    pcts.forEach((_, i) => {
      const release = stageRelease(i, gross(i), ours, released);
      stages.push({ index: i, confirmed: confirmedFor(deal, i, i === pcts.length - 1, release, events, released, endedAt), released: release });
    });
  } else {
    let paidGross = 0n;
    pcts.forEach((_, i) => {
      const release = stageRelease(i, gross(i), ours, released);
      if (!release) return;
      paidGross += gross(i);
      stages.push({ index: i, confirmed: confirmedFor(deal, i, false, release, events, released, endedAt), released: release });
    });
    const refundMove = ours.find((m) => m.kind === 'escrow_refund' && m.state === 'completed');
    const at = refundMove?.completedAt ?? deal.cancelledAt!;
    const refund: DealRecordStage['released'] =
      deal.cancelKind === 'pre-accept' && !refundMove
        ? null
        : {
            sellerUsdc: '0',
            refundUsdc: usdc(refundMove ? BigInt(refundMove.amountMicros) : total - paidGross),
            feeUsdc: '0',
            at,
            tx: (refundMove && legTx(refundMove.legs)) ?? deal.refundTxHash ?? null,
            reference: refundMove?.reference ?? null,
          };
    const confirmed: DealRecordStage['confirmed'] = disputeSettled(deal, events)
      ? disputeConfirmed(deal, at)
      : BOTH_CANCELLED.has(deal.cancelKind ?? '')
        ? { way: 'cancelled_by_both', at }
        : { way: 'refunded', at, ...(deal.cancelReason ? { reason: deal.cancelReason } : {}) };
    stages.push({ index: stages.length ? stages[stages.length - 1]!.index + 1 : 0, confirmed, released: refund });
  }

  return {
    v: 1,
    jobId: deal.jobId,
    reference: dealReference(deal.jobId) ?? deal.jobId,
    kind: dealKindOf(deal),
    buyer: deal.buyer,
    seller: deal.seller,
    agreed: {
      digest: deal.sellerApprovedAgreementDigest ?? deal.sellerApprovedTermsDigest ?? null,
      buyerAt: events.find((e) => e.type === 'escrow.funded')?.ts ?? null,
      sellerAt: deal.sellerApprovedAt ?? deal.acceptedAt ?? null,
      title: (deal.terms.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, 80),
      priceUsdc: deal.dealAmountUsdc,
    },
    held,
    stages,
    ended: endedOf(deal),
    endedAt,
  };
}

/// Keys sorted at every depth, no whitespace, undefined dropped: the same
/// record always gives the same text, whatever order it was built in.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/// What Karwan signs: the keccak of the canonical record.
export function dealRecordDigest(record: DealRecord): `0x${string}` {
  return keccak256(toHex(canonical(record)));
}
