import type { Address, Hex } from 'viem';
import { KEEP_SELECTORS, type KeepCall } from '../shared/adapterReport.js';

/// Candidates only: each one is confirmed by a simulated call from the
/// adapter before it enters a report, so the contract decides what is due.
const DAY = 86_400;
const APPEAL_WINDOW = 3 * DAY;
const RULING_PERIOD = 5 * DAY;
const PROPOSAL_WINDOW = 5 * DAY;
const ACCEPTED = 2;
const DISPUTED = 3;

export interface AgreementView {
  state: number;
  deliveredAt: number;
  deadline: number;
  reviewEnd: number;
  checkFailed: boolean;
  partsPaid: number;
}

export interface DisputeView {
  openedAt: number;
  proposed: boolean;
  escalated: boolean;
  proposedAt: number;
  escalatedAt: number;
}

export type AlertKind = 'deadline_near_no_delivery' | 'dispute_no_proposal' | 'ruling_due' | 'owed_balance';

export interface Alert {
  kind: AlertKind;
  family: Address;
  dealId?: Hex;
  to?: Address;
  amount?: string;
}

const call = (family: Address, signature: keyof typeof KEEP_SELECTORS, args: Hex): KeepCall => ({
  family,
  selector: KEEP_SELECTORS[signature],
  args,
});

export function agreementCandidates(family: Address, dealId: Hex, d: AgreementView, dispute: DisputeView, now: number): KeepCall[] {
  const out: KeepCall[] = [];
  if (d.state === ACCEPTED) {
    if (d.deliveredAt > 0 && d.reviewEnd > 0 && now >= d.reviewEnd && !d.checkFailed) out.push(call(family, 'claim(bytes32)', dealId));
    if (now > d.deadline) out.push(call(family, 'reclaim(bytes32)', dealId));
  } else if (d.state === DISPUTED) {
    if (dispute.proposed && !dispute.escalated && now >= dispute.proposedAt + APPEAL_WINDOW) {
      out.push(call(family, 'executeRuling(bytes32)', dealId));
    }
    if (dispute.escalated && now >= dispute.escalatedAt + RULING_PERIOD) out.push(call(family, 'applyFallback(bytes32)', dealId));
  }
  return out;
}

export function agreementAlerts(family: Address, dealId: Hex, d: AgreementView, dispute: DisputeView, now: number): Alert[] {
  const out: Alert[] = [];
  if (d.state === ACCEPTED && d.deliveredAt === 0 && d.deadline > now && d.deadline - now <= DAY) {
    out.push({ kind: 'deadline_near_no_delivery', family, dealId });
  }
  if (d.state === DISPUTED) {
    if (!dispute.proposed && !dispute.escalated && now - dispute.openedAt >= PROPOSAL_WINDOW - DAY) {
      out.push({ kind: 'dispute_no_proposal', family, dealId });
    }
    if (dispute.escalated && now - dispute.escalatedAt >= RULING_PERIOD - DAY) out.push({ kind: 'ruling_due', family, dealId });
  }
  return out;
}
