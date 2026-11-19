import { DEAL_STATE } from '../chain/dealEscrowV3.js';
import { caseStep, type CaseStep } from './disputeCase.js';
import type { JudgeProposal } from './disputeJudge.js';

/// What the deal page shows each side of an escrow family dispute while it is
/// heard (view 90): the step it is on and the date that step ends. Read from
/// the escrow's own dispute record, so the page and the watcher agree.

const APPEAL_WINDOW_MS = 72 * 3_600_000;
const RULING_PERIOD_MS = 5 * 86_400_000;

/// The escrow's dispute record (AgreementEscrow.disputeOf), times in seconds.
export interface ChainDispute {
  openedAt: bigint;
  proposed: boolean;
  escalated: boolean;
  proposedAt: bigint;
  escalatedAt: bigint;
}

export type HearingStep = 'answers' | 'finding' | 'object' | 'people';

export interface HearingView {
  step: HearingStep;
  /// When both sides' answers are due.
  answersBy: number;
  /// When the finding is due, or it goes to people as it is.
  findingBy: number;
  /// When the time to object ends and the finding pays out. Set once proposed on chain.
  objectBy: number | null;
  /// When someone asked for people to decide. Set once with the review Safe.
  askedAt: number | null;
  /// When people must have decided, or the escrow's fallback applies.
  ruleBy: number | null;
}

export interface HearingInput {
  dispute: ChainDispute;
  nowMs: number;
  statements: { buyer: boolean; seller: boolean };
  finding: Pick<JudgeProposal, 'status' | 'reviewedSellerBps'> | null;
  partialBps: number;
  linkHeld: boolean;
  windowMs: number;
  deadlineMs: number;
}

const STEP: Record<Exclude<CaseStep, 'none'>, HearingStep> = {
  hearing: 'answers',
  finding: 'finding',
  review: 'finding',
  propose: 'finding',
  'appeal-open': 'object',
  execute: 'object',
  refer: 'people',
  'with-review': 'people',
  fallback: 'people',
};

/// Null when the escrow holds no open dispute for the deal.
export function hearingView(i: HearingInput): HearingView | null {
  const d = i.dispute;
  if (d.openedAt === 0n) return null;
  const step = caseStep({
    view: { state: DEAL_STATE.Disputed, escalated: d.escalated, proposal: d.proposed, proposedAt: d.proposedAt, disputedAt: d.openedAt },
    escalatedAt: d.escalatedAt,
    nowSecs: Math.floor(i.nowMs / 1000),
    statements: i.statements,
    finding: i.finding
      ? { status: i.finding.status, sellerBps: i.finding.status === 'awaiting-review' ? null : i.finding.reviewedSellerBps ?? null }
      : null,
    partialBps: i.partialBps,
    linkHeld: i.linkHeld,
    windowSecs: Math.floor(i.windowMs / 1000),
    deadlineSecs: Math.floor(i.deadlineMs / 1000),
  });
  if (step === 'none') return null;
  const opened = Number(d.openedAt) * 1000;
  const asked = d.escalated ? Number(d.escalatedAt) * 1000 : null;
  return {
    step: STEP[step],
    answersBy: opened + i.windowMs,
    findingBy: opened + i.deadlineMs,
    objectBy: d.proposed ? Number(d.proposedAt) * 1000 + APPEAL_WINDOW_MS : null,
    askedAt: asked,
    ruleBy: asked !== null ? asked + RULING_PERIOD_MS : null,
  };
}

/// The finding as the two sides see it: nothing until a person at Karwan has
/// confirmed it, then the confirmed share and reason, never who confirmed it
/// or how it was worked out inside.
export type PartyFinding = Omit<JudgeProposal, 'model' | 'inputsHash' | 'reviewedBy' | 'reviewReason' | 'findingHash'>;

export function partyFinding(p: JudgeProposal | undefined): PartyFinding | undefined {
  if (!p || p.status === 'awaiting-review' || p.reviewedSellerBps === undefined) return undefined;
  return {
    sellerBps: p.reviewedSellerBps,
    items: p.items,
    confidence: p.confidence,
    summary: p.reviewReason?.trim() || p.summary,
    proposedAt: p.proposedAt,
    status: p.status,
    reviewedSellerBps: p.reviewedSellerBps,
    reviewedAt: p.reviewedAt,
  };
}
