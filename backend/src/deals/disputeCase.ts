import { keccak256, toBytes, type Hex } from 'viem';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';

/// Where a disputed escrow family deal stands (view 90, first slice): both
/// sides are heard, a finding is written and a person confirms it before
/// anything is proposed on chain. Read from the chain view, the deal row and
/// the clock only, so a retry always lands on the same step.

/// DisputeLib's fixed windows.
const APPEAL_WINDOW_SECS = 72 * 3600;
const RULING_PERIOD_SECS = 5 * 86_400;
const BPS = 10_000;

export type CaseStep =
  | 'none'
  | 'hearing'
  | 'finding'
  | 'review'
  | 'propose'
  | 'refer'
  | 'appeal-open'
  | 'execute'
  | 'with-review'
  | 'fallback';

export interface CaseFinding {
  status: 'awaiting-review' | 'confirmed' | 'overridden';
  /// Null when the finding names no share and a person must set one.
  sellerBps: number | null;
}

export interface CaseInput {
  view: Pick<DealV3View, 'state' | 'escalated' | 'proposal' | 'proposedAt' | 'disputedAt'>;
  escalatedAt: bigint;
  nowSecs: number;
  statements: { buyer: boolean; seller: boolean };
  finding: CaseFinding | null;
  /// The share the deal's terms let the arbiter propose besides all or nothing; 0 for none.
  partialBps: number;
  /// The delivery link is held by the safety check and no person has cleared it (view 63).
  linkHeld: boolean;
  windowSecs: number;
  deadlineSecs: number;
}

export function caseStep(i: CaseInput): CaseStep {
  const { view } = i;
  if (view.state !== DEAL_STATE.Disputed) return 'none';
  const now = BigInt(i.nowSecs);
  if (view.escalated) return now >= i.escalatedAt + BigInt(RULING_PERIOD_SECS) ? 'fallback' : 'with-review';
  if (view.proposal) return now >= view.proposedAt + BigInt(APPEAL_WINDOW_SECS) ? 'execute' : 'appeal-open';
  if (i.linkHeld) return 'refer';

  const confirmed = i.finding && i.finding.status !== 'awaiting-review' ? i.finding : null;
  if (confirmed) return proposable(confirmed.sellerBps, i.partialBps) ? 'propose' : 'refer';
  if (now >= view.disputedAt + BigInt(i.deadlineSecs)) return 'refer';
  if (i.finding) return 'review';
  const heard = (i.statements.buyer && i.statements.seller) || now > view.disputedAt + BigInt(i.windowSecs);
  return heard ? 'finding' : 'hearing';
}

/// The arbiter may propose all, nothing, or exactly the share the terms name.
function proposable(sellerBps: number | null, partialBps: number): boolean {
  if (sellerBps === null) return false;
  return sellerBps === 0 || sellerBps === BPS || (partialBps !== 0 && sellerBps === partialBps);
}

export interface FindingRecord {
  dealKey: string;
  inputsHash: string;
  sellerBps: number;
  items: Array<{ item: string; finding: string; evidence: string }>;
  reviewer: string;
  reason: string;
  confirmedAt: number;
}

/// The hash that goes on chain with the proposal or the panel's ruling, so the
/// record a person is shown can be checked against the escrow.
export function findingHash(record: FindingRecord): Hex {
  const canonical = {
    confirmedAt: record.confirmedAt,
    dealKey: record.dealKey,
    inputsHash: record.inputsHash,
    items: record.items.map((x) => ({ evidence: x.evidence, finding: x.finding, item: x.item })),
    reason: record.reason,
    reviewer: record.reviewer,
    sellerBps: record.sellerBps,
  };
  return keccak256(toBytes(JSON.stringify(canonical)));
}
