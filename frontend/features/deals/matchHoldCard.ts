import type { DirectDeal } from '@/core/api';

/// The card on the deal page for the security agent's screen of the match
/// (architecture view 21). A hold is advisory: the money is in escrow and
/// release follows the deal's own rules, so the card says that and offers a
/// person. A flag is a note. Pure, so the copy is tested without the page.

export interface MatchHoldCopy {
  matchHeldLabel: string;
  matchHeldBody: string;
  matchHeldAsk: string;
  matchFlaggedLabel: string;
  matchFlaggedBody: string;
  matchPaidLine: string;
}

export interface MatchHoldCard {
  kind: 'hold' | 'flag';
  title: string;
  body: string;
  lines: string[];
  /// The button that opens the help panel with the deal attached; only on a hold.
  ask: string | null;
  paidLine: string | null;
}

export function matchHoldCard(matchHold: DirectDeal['matchHold'], copy: MatchHoldCopy): MatchHoldCard | null {
  if (!matchHold) return null;
  const paidLine = matchHold.paidConsulted ? copy.matchPaidLine : null;
  if (matchHold.decision === 'hold') {
    return { kind: 'hold', title: copy.matchHeldLabel, body: copy.matchHeldBody, lines: matchHold.lines, ask: copy.matchHeldAsk, paidLine };
  }
  if (matchHold.lines.length === 0) return null;
  return { kind: 'flag', title: copy.matchFlaggedLabel, body: copy.matchFlaggedBody, lines: matchHold.lines, ask: null, paidLine };
}
