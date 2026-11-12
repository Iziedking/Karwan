import type { CaseChannel, SupportCase } from './cases.js';
import type { CaseKind } from './caseRules.js';

/// What the team's Telegram chat says about cases (view 78). It is for alerts
/// only: replies are written on the support desk, so each one carries a name
/// and leaves a row.

export const KIND: Record<CaseKind, string> = {
  money_in_deal: 'Money held in a deal',
  transfer_missing: 'Transfer did not arrive',
  account: 'Account and sign-in',
  using_karwan: 'Using Karwan',
  other: 'Something else',
};
const CHANNEL: Record<CaseChannel, string> = { web: 'website', telegram: 'Telegram', email: 'email' };
const DESK = 'Answer it on the support desk.';

function span(ms: number): string {
  const total = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export function newCaseAlert(c: { ref: string; kind: CaseKind; who: string; lastChannel: CaseChannel; firstLine: string }): string {
  const ask = c.firstLine.length > 300 ? `${c.firstLine.slice(0, 299)}…` : c.firstLine;
  return `New case ${c.ref} · ${KIND[c.kind]} · ${c.who} on ${CHANNEL[c.lastChannel]}\n\n${ask}\n\n${DESK}\n#${c.ref}`;
}

export function overdueAlert(c: Pick<SupportCase, 'ref' | 'kind' | 'dueAt'>, now: number): string {
  return `${c.ref} is late by ${span(now - c.dueAt)} with no reply · ${KIND[c.kind]}. ${DESK}\n#${c.ref}`;
}

export function askedAlert(a: { ref: string; asker: string; asked: string; text: string }): string {
  return `${a.asked}, ${a.asker} asks you about ${a.ref}: ${a.text}\n\n${DESK}\n#${a.ref}`;
}

/// Open cases past their first-reply time that no teammate has answered and
/// the team has not been told about yet.
export function overdueCases(cases: readonly SupportCase[], now: number): SupportCase[] {
  return cases.filter((c) => c.state !== 'solved' && !c.firstRepliedAt && !c.overdueSentAt && c.dueAt < now);
}

const REF = /(KSUP-[0-9a-f]{10}|K[ST]-\d{4,})/i;

/// A teammate answering a case from the team chat (a reply to an alert, or
/// /r or /close with a reference). Nothing reaches the person from here; the
/// chat points them to the desk.
export function operatorChatAnswer(text: string, repliedText: string | undefined): { ref: string } | null {
  const t = text.trim();
  const command = /^\/(?:r|close)\s+(\S+)/i.exec(t);
  if (command && REF.test(command[1]!)) return { ref: REF.exec(command[1]!)![1]!.replace(/^k([st])-/i, (_, x: string) => `K${x.toUpperCase()}-`) };
  const quoted = repliedText ? REF.exec(repliedText) : null;
  return quoted ? { ref: quoted[1]! } : null;
}
