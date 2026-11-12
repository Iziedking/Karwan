import type { AdminDeskAction } from '@/core/api';

/// The Activity log (view 79): every change from the desk as a sentence, with
/// who did it and what came of it.

export type ActivityKind = 'money' | 'account' | 'sign_in' | 'other';

export interface ActivityRow {
  id: string;
  at: number;
  who: string;
  what: string;
  second: string | null;
  kind: ActivityKind;
}

export const ACTIVITY_VIEWS: { key: 'all' | ActivityKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'money', label: 'Money moves' },
  { key: 'account', label: 'Account changes' },
  { key: 'sign_in', label: 'Sign-ins' },
];

const short = (id: string) => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
const CASE = /^(K[ST]-\d{4,})\s*:/;

type Rule = { re: RegExp; kind: ActivityKind; what: (m: RegExpMatchArray) => string };

const RULES: Rule[] = [
  { re: /^POST \/api\/admin\/deals\/([^/]+)\/release$/, kind: 'money', what: (m) => `Asked to pay the next part of deal ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/deals\/([^/]+)\/resolve$/, kind: 'money', what: (m) => `Asked to rule on deal ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/deals\/([^/]+)\/force-cancel$/, kind: 'money', what: (m) => `Asked to close deal ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/deals\/([^/]+)\/extend$/, kind: 'other', what: (m) => `Gave the seller more time on deal ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/requests\/[^/]+\/cancel$/, kind: 'money', what: () => 'Withdrew a request' },
  { re: /^POST \/api\/admin\/usyc\/(run|cover)$/, kind: 'money', what: (m) => (m[1] === 'run' ? 'Asked to run the USYC wrap' : 'Asked to cover a vault shortfall') },
  { re: /^POST \/api\/admin\/disputes\/([^/]+)\/(prepare|sign|execute)$/, kind: 'money', what: (m) => `${m[2] === 'execute' ? 'Ran' : m[2] === 'sign' ? 'Signed' : 'Prepared'} a ruling on deal ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/accounts\/([^/]+)\/pause$/, kind: 'account', what: (m) => `Pause money out for ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/accounts\/([^/]+)\/unpause$/, kind: 'account', what: (m) => `Asked to lift the pause on ${short(m[1]!)}` },
  { re: /^\w+ \/api\/admin\/profiles\/([^/]+)\/business$/, kind: 'account', what: (m) => `Changed the business check of ${short(m[1]!)}` },
  { re: /^POST \/api\/admin\/reset-history$/, kind: 'account', what: () => 'Asked to delete a person’s history' },
  { re: /^PUT \/api\/admin\/access\/[^/]+$/, kind: 'account', what: () => 'Changed a teammate’s pages' },
  { re: /^POST \/api\/admin\/team-members\/[^/]+\/reset-code$/, kind: 'account', what: () => 'Reset a teammate’s code' },
  { re: /^\w+ \/api\/admin\/(team-members|invites?)(\/.*)?$/, kind: 'account', what: () => 'Changed the team' },
  { re: /^POST \/api\/admin\/support\/cases\/([^/]+)\/reply$/, kind: 'other', what: (m) => `Replied on ${m[1]}` },
  { re: /^POST \/api\/admin\/support\/cases\/([^/]+)\/note$/, kind: 'other', what: (m) => `Wrote a team note on ${m[1]}` },
  { re: /^POST \/api\/admin\/support\/cases\/([^/]+)\/(\w+)$/, kind: 'other', what: (m) => `Updated ${m[1]}` },
  { re: /^POST \/api\/admin\/support\/room$/, kind: 'other', what: () => 'Wrote in the team room' },
  { re: /^\w+ \/api\/admin\/deal-rules$/, kind: 'other', what: () => 'Changed the deal rules switch' },
  { re: /^\w+ \/api\/admin\/form-limits$/, kind: 'other', what: () => 'Changed the waitlist and survey limits' },
];

function who(r: AdminDeskAction, nameOf: (id: string | null) => string | null): string {
  if (r.via === 'key' && !r.memberId) return 'A desk key';
  if (r.via === 'shared-token') return 'The shared token';
  return nameOf(r.memberId) ?? r.memberEmail ?? (r.via === 'key' ? 'A desk key' : 'Someone signed out');
}

function reasonOf(r: AdminDeskAction): string | null {
  const from = (v: unknown) => (v && typeof v === 'object' && typeof (v as { reason?: unknown }).reason === 'string' ? (v as { reason: string }).reason : null);
  const result = r.result as { request?: unknown } | null;
  return from(result?.request) ?? from(r.request);
}

export function activityRow(r: AdminDeskAction, nameOf: (id: string | null) => string | null): ActivityRow {
  const base = { id: r.id, at: r.at, who: who(r, nameOf) };
  if (r.via === 'sign-in' || /^\w+ \/api\/admin\/session(\/code)?$/.test(`${r.method} ${r.path}`)) {
    return { ...base, what: r.method === 'DELETE' ? 'Signed out' : 'Signed in', second: r.outcome === 'done' ? null : 'Refused', kind: 'sign_in' };
  }
  const line = `${r.method} ${r.path}`;
  const refused = r.outcome === 'refused' ? 'Refused' : r.outcome === 'failed' ? 'It did not go through' : null;
  const approve = line.match(/^POST \/api\/admin\/requests\/[^/]+\/(approve|turn-down)$/);
  if (approve) {
    const req = (r.result as { request?: { label?: string; requestedBy?: { name?: string | null; email?: string | null } } } | null)?.request;
    const label = req?.label ?? 'a request';
    const asker = req?.requestedBy?.name ?? req?.requestedBy?.email ?? null;
    return { ...base, what: `${approve[1] === 'approve' ? 'Approved' : 'Turned down'}: ${label}`, second: refused ?? (asker ? `Asked by ${asker}` : null), kind: 'money' };
  }
  for (const rule of RULES) {
    const m = line.match(rule.re);
    if (!m) continue;
    const ref = reasonOf(r)?.match(CASE)?.[1];
    const waits = r.status === 202 ? 'Waits for a second teammate' : null;
    return { ...base, what: `${rule.what(m)}${ref ? ` (${ref})` : ''}`, second: refused ?? waits, kind: rule.kind };
  }
  return { ...base, what: line, second: refused, kind: 'other' };
}

export function activityShown(rows: ActivityRow[], view: 'all' | ActivityKind): ActivityRow[] {
  return view === 'all' ? rows : rows.filter((r) => r.kind === view);
}

const cell = (v: string | null) => {
  const s = v ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function activityCsv(rows: ActivityRow[]): string {
  return `when,who,what,detail\n${rows.map((r) => [new Date(r.at).toISOString(), r.who, r.what, r.second].map(cell).join(',')).join('\n')}\n`;
}
