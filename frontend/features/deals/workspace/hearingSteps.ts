import type { DisputeHearingView } from '@/core/api';

export type HearingRowKey = 'opened' | 'answers' | 'finding' | 'object' | 'asked' | 'people' | 'paid';

export interface HearingRow {
  key: HearingRowKey;
  state: 'done' | 'current' | 'upcoming';
}

/// The time the current step has, start and end, for its countdown bar.
export interface Countdown {
  from: number;
  to: number;
}

const ROUTE: HearingRowKey[] = ['opened', 'answers', 'finding', 'object', 'paid'];
const TO_PEOPLE: HearingRowKey[] = ['opened', 'answers', 'finding', 'asked', 'people', 'paid'];
const CURRENT: Record<DisputeHearingView['step'], HearingRowKey> = { answers: 'answers', finding: 'finding', object: 'object', people: 'people' };
const SHOWN = 4;
const OBJECT_MS = 72 * 3_600_000;

/// The steps of a heard dispute (view 90, Figma 375:570): four at a time, the
/// current one third where it can be, so what is done, now and next all show.
export function hearingSteps(h: DisputeHearingView, openedAt: number | null): { rows: HearingRow[]; countdown: Countdown | null } {
  const route = h.step === 'people' ? TO_PEOPLE : ROUTE;
  const current = route.indexOf(CURRENT[h.step]);
  const start = Math.max(0, Math.min(current - 2, route.length - SHOWN));
  const rows = route.slice(start, start + SHOWN).map((key, i) => {
    const at = start + i;
    return { key, state: at < current ? 'done' : at === current ? 'current' : 'upcoming' } as HearingRow;
  });
  return { rows, countdown: countdown(h, openedAt) };
}

function countdown(h: DisputeHearingView, openedAt: number | null): Countdown | null {
  switch (h.step) {
    case 'answers':
      return openedAt ? { from: openedAt, to: h.answersBy } : null;
    case 'finding':
      return openedAt ? { from: openedAt, to: h.findingBy } : null;
    case 'object':
      return h.objectBy ? { from: h.objectBy - OBJECT_MS, to: h.objectBy } : null;
    case 'people':
      return h.askedAt && h.ruleBy ? { from: h.askedAt, to: h.ruleBy } : null;
  }
}

/// How much of the time has passed, 0 to 1.
export function elapsed(c: Countdown, now: number): number {
  if (c.to <= c.from) return 1;
  return Math.min(1, Math.max(0, (now - c.from) / (c.to - c.from)));
}

/// What is left to object, in whole days, or hours under a day.
export function timeLeft(to: number, now: number): { days: number } | { hours: number } {
  const ms = Math.max(0, to - now);
  const days = Math.floor(ms / 86_400_000);
  return days >= 1 ? { days } : { hours: Math.max(1, Math.ceil(ms / 3_600_000)) };
}

/// Who the confirmed finding pays, from the viewer's side.
export function outcome(sellerBps: number, viewerIsBuyer: boolean): 'toYou' | 'toThem' | 'backToYou' | 'backToThem' | 'split' {
  if (sellerBps === 10_000) return viewerIsBuyer ? 'toThem' : 'toYou';
  if (sellerBps === 0) return viewerIsBuyer ? 'backToYou' : 'backToThem';
  return 'split';
}

export type SignalKey = 'youAnswer' | 'theyAnswer' | 'finding' | 'object' | 'people';

/// The one line a closed problem card shows (owner, pattern A, 20 Nov 2026,
/// Figma 380:570): the step now and its date. The card opens itself only when
/// the person has something to do: answer, or read a finding they can object to.
export function hearingSignal(h: DisputeHearingView, youAnswered: boolean, now: number): { key: SignalKey; at: number | null; needsYou: boolean } {
  switch (h.step) {
    case 'answers':
      return { key: youAnswered ? 'theyAnswer' : 'youAnswer', at: h.answersBy, needsYou: !youAnswered };
    case 'finding':
      return { key: 'finding', at: h.findingBy, needsYou: false };
    case 'object':
      return { key: 'object', at: h.objectBy, needsYou: h.objectBy !== null && now < h.objectBy };
    case 'people':
      return { key: 'people', at: h.ruleBy, needsYou: false };
  }
}
