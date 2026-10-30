import { asksToPayOutside } from './payOutside.js';

/// Messaging someone by tag before any deal: who may send, the spam pause, and
/// the escrow warning. Pure rules; the store and alerts live elsewhere.

export interface SenderHistory {
  /// The first message the sender wrote to each person, and whether that
  /// person has ever replied.
  firstMessages: Array<{ to: string; at: number; answered: boolean }>;
}

export type MayMessage = { ok: true } | { ok: false; reason: 'unknown_tag' | 'self' | 'paused'; until?: number };

const DAY = 24 * 60 * 60 * 1000;
const PAUSE_AFTER = 5;
export const ESCROW_WARNING = 'Keep payment in Karwan escrow. Never pay outside it.';

export function pairKey(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `dm:${x}:${y}`;
}

/// A sender whose last five first messages in a day all went unanswered is
/// paused from writing to anyone new until the oldest of them is a day old.
/// People they already wrote to stay reachable.
export function mayMessage(input: { from: string; to: string | null; history: SenderHistory; now: number }): MayMessage {
  if (!input.to) return { ok: false, reason: 'unknown_tag' };
  const from = input.from.toLowerCase();
  const to = input.to.toLowerCase();
  if (from === to) return { ok: false, reason: 'self' };
  if (input.history.firstMessages.some((m) => m.to.toLowerCase() === to)) return { ok: true };
  const unanswered = input.history.firstMessages
    .filter((m) => !m.answered && input.now - m.at < DAY)
    .map((m) => m.at)
    .sort((a, b) => a - b);
  if (unanswered.length < PAUSE_AFTER) return { ok: true };
  return { ok: false, reason: 'paused', until: unanswered[unanswered.length - PAUSE_AFTER]! + DAY };
}

const PHONE = /(?:\+?\d[\s().-]?){7,}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const LINK = /https?:\/\//i;

/// A phone number, an email or a link: how people take a trade, or a rating
/// note, off Karwan.
export function hasContactDetails(text: string): boolean {
  return PHONE.test(text) || EMAIL.test(text) || LINK.test(text);
}

/// Contact details before any deal between the two are the usual start of an
/// off-platform payment, so the message carries a warning. Asking outright to
/// be paid outside Karwan is warned whether or not they have a deal.
export function warningFor(body: string, hasDeal: boolean): string | null {
  return (!hasDeal && hasContactDetails(body)) || asksToPayOutside(body) ? ESCROW_WARNING : null;
}
