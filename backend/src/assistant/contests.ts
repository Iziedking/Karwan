import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// The assistant's contest cards (view 40). Each one shows every figure before
/// anything moves; posting and picking winners are money steps, so on a chat
/// channel they are confirmed on Karwan.

export interface ContestInputPayload {
  title: string;
  brief: string;
  prizeUsdc: string;
  places: number;
  /// Each place's part in basis points, first place first; the suggested split when left out.
  shares?: number[];
  entriesDays: number;
  awardDays?: number;
  kind?: 'design' | 'bugs' | 'hackathon';
}

export interface ContestPostConfirm extends ConfirmActionBase {
  intent: 'contest_post';
  payload: ContestInputPayload;
}
export interface ContestEnterConfirm extends ConfirmActionBase {
  intent: 'contest_enter';
  payload: { contestId: string; note: string; heldFiles: true };
}
export interface ContestAwardConfirm extends ConfirmActionBase {
  intent: 'contest_award';
  payload: { contestId: string; entryIds: string[] };
}
export interface ContestCancelConfirm extends ConfirmActionBase {
  intent: 'contest_cancel';
  payload: { contestId: string };
}
export interface ContestMarkConfirm extends ConfirmActionBase {
  intent: 'contest_mark';
  payload: { contestId: string; entryId: string; reason: string };
}

export interface DraftCard {
  title: string;
  totalMicros: string;
  feeHalfMicros: string;
  prizeMicros: string;
  placeNetMicros: string[];
  entriesBy: number;
  awardBy: number;
  /// On the second escrow: when the earliest entries are paid if nobody is picked.
  payoutFrom?: number;
  ifNobody: string;
}

const usdc = (micros: string) => `${(Number(micros) / 1_000_000).toFixed(2)} USDC`;
const PLACE = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth'];

/// Amounts said for each place, as basis points of the prize. They must add up
/// to the prize within a cent; what rounding leaves goes to the first place.
export function sharesFromAmounts(amounts: number[], prize: number): number[] | null {
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (amounts.some((a) => !(a > 0)) || Math.abs(sum - prize) > 0.01) return null;
  const bps = amounts.map((a) => Math.floor((a / sum) * 10_000));
  if (bps.some((b) => b <= 0)) return null;
  bps[0]! += 10_000 - bps.reduce((a, b) => a + b, 0);
  return bps;
}
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function buildContestPostConfirm(input: ContestInputPayload, card: DraftCard, money?: (usdc: number) => string): ContestPostConfirm {
  const amount = (micros: string) => (money ? money(Number(micros) / 1_000_000) : usdc(micros));
  return {
    kind: 'confirm',
    id: `contest_post:${confirmNonce()}`,
    intent: 'contest_post',
    title: `Run a contest: ${card.title}`,
    summary: card.payoutFrom
      ? `Your agent puts up the prize now. Sellers enter until ${day(card.entriesBy)}, you judge until ${day(card.awardBy)}, and from ${day(card.payoutFrom)} the earliest entries are paid if you have picked nobody.`
      : `Your agent puts up the prize now. Sellers enter until ${day(card.entriesBy)}, then you pick the winners by ${day(card.awardBy)}.`,
    warning: card.ifNobody,
    fields: [
      { label: 'Prize', value: amount(card.prizeMicros) },
      { label: 'Karwan fee', value: amount(card.feeHalfMicros) },
      { label: 'You put up', value: amount(card.totalMicros) },
      ...card.placeNetMicros.map((m, i) => ({ label: `${PLACE[i]} place gets`, value: amount(m) })),
    ],
    payload: input,
    confirmLabel: 'Put up the prize',
    cancelLabel: 'Not now',
  };
}

export function buildContestEnterConfirm(i: { contestId: string; title: string; files: number; note: string }): ContestEnterConfirm | { error: string } {
  if (i.files === 0) return { error: 'Send me your work first: images or PDF files, with a caption like "my entry".' };
  return {
    kind: 'confirm',
    id: `contest_enter:${i.contestId}:${confirmNonce()}`,
    intent: 'contest_enter',
    title: `Enter ${i.title}`,
    summary: 'The buyer sees your first image and your note. Your full files go to them only if you win.',
    fields: [
      { label: 'Files', value: String(i.files) },
      ...(i.note ? [{ label: 'Note', value: i.note }] : []),
    ],
    payload: { contestId: i.contestId, note: i.note, heldFiles: true },
    confirmLabel: 'Enter',
    cancelLabel: 'Not now',
  };
}

export function buildContestAwardConfirm(i: {
  contestId: string; title: string; winners: { entryId: string; name: string }[]; netMicros: string[]; backMicros: string;
}): ContestAwardConfirm {
  return {
    kind: 'confirm',
    id: `contest_award:${i.contestId}:${confirmNonce()}`,
    intent: 'contest_award',
    title: `Pay the winners of ${i.title}`,
    summary: 'Each winner is paid now, and their full files come to you.',
    warning: 'Once the winners are paid this cannot be undone.',
    fields: [
      ...i.winners.map((w, n) => ({ label: `${PLACE[n]} place, ${w.name}`, value: usdc(i.netMicros[n] ?? '0') })),
      ...(BigInt(i.backMicros) > 0n ? [{ label: 'Comes back to you', value: usdc(i.backMicros) }] : []),
    ],
    payload: { contestId: i.contestId, entryIds: i.winners.map((w) => w.entryId) },
    confirmLabel: 'Pay the winners',
    cancelLabel: 'Not now',
  };
}

export function buildContestCancelConfirm(i: { contestId: string; title: string; prizeMicros: string; entries: number }): ContestCancelConfirm | { error: string } {
  if (i.entries > 0) return { error: 'Someone has entered, so the contest stays open. Pick the winners, or the prize comes back after the date.' };
  return {
    kind: 'confirm',
    id: `contest_cancel:${i.contestId}:${confirmNonce()}`,
    intent: 'contest_cancel',
    title: `Take back ${i.title}`,
    summary: 'Nobody has entered yet, so the prize and the fee come back to your agent.',
    fields: [{ label: 'Prize', value: usdc(i.prizeMicros) }],
    payload: { contestId: i.contestId },
    confirmLabel: 'Take it back',
    cancelLabel: 'Keep it open',
  };
}

/// The buyer marks an entry not valid (view 88). Every entrant reads the
/// reason, and a marked entry is never paid.
export function buildContestMarkConfirm(i: { contestId: string; title: string; entryId: string; seller: string; reason: string }): ContestMarkConfirm {
  return {
    kind: 'confirm',
    id: `contest_mark:${i.contestId}:${i.entryId}:${confirmNonce()}`,
    intent: 'contest_mark',
    title: `Mark ${i.seller}'s entry not valid`,
    summary: `In ${i.title}. Every entrant sees your reason, and this entry is never paid. ${i.seller} can send a new entry while entries are open; it goes to the back of the line.`,
    fields: [
      { label: 'Entry', value: i.seller },
      { label: 'Reason', value: i.reason },
    ],
    payload: { contestId: i.contestId, entryId: i.entryId, reason: i.reason },
    confirmLabel: 'Mark not valid',
    cancelLabel: 'Keep it',
  };
}
