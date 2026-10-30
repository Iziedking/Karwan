import type { DirectDeal } from '../db/deals.js';
import type { ReviewerRole } from './deliveryReview.js';

/// A match the security agent held for a look (architecture view 21). The hold
/// is advisory: it moves no money and blocks no release. A person at Karwan
/// clears it with a written reason, and each side reads only the lines meant
/// for it. Pure: the caller supplies the deal and the clock.

export type MatchRisk = NonNullable<DirectDeal['matchRisk']>;
type MatchReasonRow = MatchRisk['reasons'][number];

const MIN_REASON = 10;
const MAX_REASON = 1000;

/// The one line both sides read on a hold, so nobody sees a held match with no
/// reason. It names the kind of signal, never the other person.
export function sharedHoldLine(flags: readonly string[]): string {
  if (flags.includes('link-offense')) {
    return 'A past delivery link from one side was flagged by the safety check. A person at Karwan looks at it. Nothing is blocked.';
  }
  return 'The security agent held this match for a person at Karwan to look at. Nothing is blocked.';
}

export function holdOpenFor(deal: Pick<DirectDeal, 'matchRisk' | 'settledAt' | 'cancelledAt'>): MatchRisk | null {
  const risk = deal.matchRisk;
  if (!risk || risk.decision !== 'hold' || risk.clearedAt) return null;
  if (deal.settledAt || deal.cancelledAt) return null;
  return risk;
}

export type ClearHoldResult =
  | { ok: true; matchRisk: MatchRisk }
  | { ok: false; code: 'closed' | 'not-held' | 'already-cleared' | 'reason-required'; message: string };

export function clearMatchHold(
  deal: Pick<DirectDeal, 'matchRisk' | 'settledAt' | 'cancelledAt'>,
  input: { role: ReviewerRole; reason: string },
  now: number,
): ClearHoldResult {
  const risk = deal.matchRisk;
  if (deal.settledAt || deal.cancelledAt) {
    return { ok: false, code: 'closed', message: 'This deal is closed, so its hold no longer matters.' };
  }
  if (!risk || risk.decision !== 'hold') {
    return { ok: false, code: 'not-held', message: 'This match is not held.' };
  }
  if (risk.clearedAt) {
    return { ok: false, code: 'already-cleared', message: 'This hold was already cleared.' };
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    return { ok: false, code: 'reason-required', message: 'Write what you checked and what you found.' };
  }
  return { ok: true, matchRisk: { ...risk, clearedAt: now, clearedBy: input.role, clearReason: reason.slice(0, MAX_REASON) } };
}

export interface MatchHoldView {
  decision: 'flag' | 'hold';
  /// The lines this side may read: its own, the shared ones, never the other side's.
  lines: string[];
  paidConsulted: boolean;
}

function rowFor(row: MatchReasonRow): { text: string; audience: 'buyer' | 'seller' | 'both' } {
  // Rows written before the audience tag are bare strings and read as shared.
  return typeof row === 'string' ? { text: row, audience: 'both' } : row;
}

/// What one party sees of the match screen. A cleared or passed match shows
/// nothing. A flag shows only when a line fits this viewer; a hold always
/// shows, with the shared line first.
export function matchHoldForParty(
  deal: Pick<DirectDeal, 'matchRisk'>,
  viewer: 'buyer' | 'seller',
): MatchHoldView | null {
  const risk = deal.matchRisk;
  if (!risk || risk.clearedAt) return null;
  const mine = risk.reasons
    .map(rowFor)
    .filter((r) => r.audience === 'both' || r.audience === viewer)
    .map((r) => r.text);
  if (risk.decision === 'hold') {
    const shared = sharedHoldLine(risk.flags);
    return { decision: 'hold', lines: [shared, ...mine.filter((l) => l !== shared)], paidConsulted: risk.paidConsulted };
  }
  if (mine.length === 0) return null;
  return { decision: 'flag', lines: mine, paidConsulted: risk.paidConsulted };
}
