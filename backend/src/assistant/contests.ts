import { confirmNonce, type ConfirmActionBase } from './actions.js';

/// The assistant's contest cards (view 40). Each one shows every figure before
/// anything moves; posting and picking winners are money steps, so on a chat
/// channel they are confirmed on Karwan.

export interface ContestInputPayload {
  title: string;
  brief: string;
  prizeUsdc: string;
  places: number;
  entriesDays: number;
  awardDays?: number;
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

export interface DraftCard {
  title: string;
  totalMicros: string;
  feeHalfMicros: string;
  prizeMicros: string;
  placeNetMicros: string[];
  entriesBy: number;
  awardBy: number;
  ifNobody: string;
}

const usdc = (micros: string) => `${(Number(micros) / 1_000_000).toFixed(2)} USDC`;
const PLACE = ['First', 'Second', 'Third'];
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function buildContestPostConfirm(input: ContestInputPayload, card: DraftCard): ContestPostConfirm {
  return {
    kind: 'confirm',
    id: `contest_post:${confirmNonce()}`,
    intent: 'contest_post',
    title: `Run a contest: ${card.title}`,
    summary: `Your agent puts up the prize now. Sellers enter until ${day(card.entriesBy)}, then you pick the winners by ${day(card.awardBy)}.`,
    warning: card.ifNobody,
    fields: [
      { label: 'Prize', value: usdc(card.prizeMicros) },
      { label: 'Karwan fee', value: usdc(card.feeHalfMicros) },
      { label: 'You put up', value: usdc(card.totalMicros) },
      ...card.placeNetMicros.map((m, i) => ({ label: `${PLACE[i]} place gets`, value: usdc(m) })),
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
