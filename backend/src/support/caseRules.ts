/// The rules a support case follows (view 78): its reference, when its first
/// reply is due, what kind of problem it is, which open case a new message
/// joins, and which teammate replies are held before they reach a person.
/// Pure, so every channel and the desk agree.

export type CaseKind = 'money_in_deal' | 'transfer_missing' | 'account' | 'using_karwan' | 'other';
export type CaseState = 'new' | 'waiting_us' | 'waiting_person' | 'solved';
export type CaseRecord = { kind: 'deal' | 'transfer'; id: string };
export type CaseNetwork = 'mainnet' | 'testnet';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/// Lagos keeps UTC+1 all year.
const LAGOS_OFFSET = HOUR;
const OPENS = 8 * HOUR;
const CLOSES = 22 * HOUR;
const FIRST_REPLY = 2 * HOUR;

export function refFor(network: CaseNetwork, n: number): string {
  return `${network === 'mainnet' ? 'KS' : 'KT'}-${n}`;
}

export function parseRef(text: string): { ref: string } | { legacyId: string } | null {
  const legacy = /\bKSUP-[0-9a-f]{10}\b/i.exec(text);
  if (legacy) return { legacyId: `KSUP-${legacy[0].slice(5).toLowerCase()}` };
  const ref = /\bK[ST]-\d{4,}\b/.exec(text);
  return ref ? { ref: ref[0] } : null;
}

/// Milliseconds since Lagos midnight, and that midnight as a timestamp.
function lagosDay(at: number): { start: number; offset: number } {
  const local = at + LAGOS_OFFSET;
  const offset = ((local % DAY) + DAY) % DAY;
  return { start: at - offset, offset };
}

export function isOpenHours(at: number): boolean {
  const { offset } = lagosDay(at);
  return offset >= OPENS && offset < CLOSES;
}

/// The next moment the desk is staffed: `at` itself when it already is.
export function backAt(at: number): number {
  const { start, offset } = lagosDay(at);
  if (offset < OPENS) return start + OPENS;
  if (offset >= CLOSES) return start + DAY + OPENS;
  return at;
}

/// Two hours of staffed time after the case opened.
export function firstReplyDue(openedAt: number): number {
  let left = FIRST_REPLY;
  let t = backAt(openedAt);
  for (;;) {
    const closes = lagosDay(t).start + CLOSES;
    if (t + left <= closes) return t + left;
    left -= closes - t;
    t = backAt(closes);
  }
}

export function outOfHoursLine(now: number, ref: string): string | null {
  if (isOpenHours(now)) return null;
  return `Our team is back at 8am Lagos time. Your case is ${ref}.`;
}

export function caseKindFromFacts(facts: { records: readonly CaseRecord[]; text: string }): CaseKind {
  if (facts.records.some((r) => r.kind === 'transfer')) return 'transfer_missing';
  if (facts.records.some((r) => r.kind === 'deal')) return 'money_in_deal';
  const text = facts.text.toLowerCase();
  if (/\b(sign(ed)? ?in|log ?in|password|passkey|account|email|verif\w*|locked out)\b/.test(text)) return 'account';
  if (/\b(how (do|can|to|does)|where (is|do|can)|what is|what does)\b/.test(text)) return 'using_karwan';
  return 'other';
}

/// The open (or solved) case a new message about these records belongs to.
export function joinOrOpen(
  cases: ReadonlyArray<{ ref: string; state: CaseState; records: readonly CaseRecord[] }>,
  records: readonly CaseRecord[],
): string | null {
  if (!records.length) return null;
  const hit = cases.find((c) => c.records.some((a) => records.some((b) => a.kind === b.kind && a.id === b.id)));
  return hit?.ref ?? null;
}

const ASKING = /\b(send|share|give|tell|enter|type|provide|reply with|what(?:'s| is| was))\b/;
const SECRET = /\b(password|passcode|pin|otp|one[- ]time code|verification code|code you (?:got|received)|seed phrase|recovery phrase|private key|card number|cvv|account number|bvn)\b/;
const WARNING = /\b(never|don'?t|do not|no one|nobody)\b/;

/// A teammate's reply that asks a person for something Karwan never asks for.
/// A sentence warning them not to share one is fine.
export function asksForSecret(text: string): boolean {
  return text
    .toLowerCase()
    .split(/[.!?\n]+/)
    .some((sentence) => {
      if (WARNING.test(sentence)) return false;
      const ask = ASKING.exec(sentence);
      if (!ask) return false;
      return SECRET.test(sentence.slice(ask.index));
    });
}
