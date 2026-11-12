import type { DirectDeal } from '../db/deals.js';
import type { CaseKind } from '../support/caseRules.js';
import { KIND } from '../support/teamAlerts.js';
import { allows, mayCall, type DeskAccess } from './adminPages.js';

/// Home on the desk (view 79): what waits for this teammate, today's figures
/// for the pages they have, the system for those who look after it, and who
/// is on the desk now. Pure: the route gathers the facts.

const DAY = 24 * 60 * 60_000;
const LAGOS = 60 * 60_000;
const ON_SHIFT_MS = 30 * 60_000;

export interface HomeFacts {
  now: number;
  callerId: string | null;
  requests: Array<{
    id: string;
    label: string;
    method: string;
    path: string;
    status: string;
    requestedAt: number;
    expiresAt: number;
    requestedBy: { memberId: string; name: string | null; email: string | null };
  }>;
  cases: Array<{ ref: string; kind: CaseKind; state: string; email?: string; dueAt: number; createdAt: number; firstRepliedAt?: number; assignee?: string }>;
  deals: Array<{ jobId: string; buyer: string; seller: string; amountUsdc: string | number; stage: string; createdAt: number }>;
  accounts: Array<{ createdAt: number; setupDone: boolean }>;
  system: SystemRow[];
  rows: Array<{ at: number; memberId: string | null }>;
  members: Array<{ id: string; name: string; email: string; role?: string }>;
}

export interface NeedItem {
  kind: 'approval' | 'dispute' | 'late_case';
  title: string;
  line: string;
  href: string;
  /// Since when it has waited.
  since: number;
  amountUsdc?: string;
}

export type TodayTile =
  | { key: 'accounts'; count: number; extra: number }
  | { key: 'deals'; count: number; usdc: string }
  | { key: 'held'; count: number; usdc: string }
  | { key: 'support'; count: number; minutes: number | null };

export interface SystemRow {
  label: string;
  state: 'working' | 'slow' | 'down';
  detail?: string;
}

export interface ShiftRow {
  name: string;
  role: string | null;
  lastAt: number;
  openCases: number;
}

export interface HomeView {
  needsYou: NeedItem[];
  today: TodayTile[];
  system: SystemRow[] | null;
  onShift: ShiftRow[];
  counts: { waiting?: number; support?: number; disputes?: number };
}

/// Midnight in Lagos (UTC+1, no summer time) at or before this moment.
export function lagosMidnight(now: number): number {
  return Math.floor((now + LAGOS) / DAY) * DAY - LAGOS;
}

const short = (id: string) => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);
const micros = (usdc: string | number) => Math.round(Number(usdc) * 1_000_000);
const usdcOf = (m: number) => String(m / 1_000_000);
const HELD = new Set(['accepted', 'delivered', 'disputed']);

export function homeFor(access: DeskAccess, owner: boolean, facts: HomeFacts): HomeView {
  const has = (page: string) => owner || allows(access, page, 'read');
  const who = { owner, access };
  const midnight = lagosMidnight(facts.now);
  const needsYou: NeedItem[] = [];

  const approvals = facts.requests.filter((r) =>
    r.status === 'pending'
    && r.expiresAt > facts.now
    && r.requestedBy.memberId !== facts.callerId
    && mayCall(who, r.method, r.path));
  for (const r of approvals) {
    needsYou.push({ kind: 'approval', title: r.label, line: `asked by ${r.requestedBy.name ?? r.requestedBy.email ?? 'a teammate'}`, href: '/admin/waiting', since: r.requestedAt });
  }

  const disputed = facts.deals.filter((d) => d.stage === 'disputed');
  if (has('disputes')) {
    for (const d of disputed) {
      needsYou.push({ kind: 'dispute', title: `Rule on deal ${short(d.jobId)}`, line: `${short(d.buyer)} and ${short(d.seller)}`, href: '/admin/disputes', since: d.createdAt, amountUsdc: usdcOf(micros(d.amountUsdc)) });
    }
  }

  const open = facts.cases.filter((c) => c.state !== 'solved');
  if (has('support')) {
    for (const c of open.filter((x) => !x.firstRepliedAt && x.dueAt < facts.now)) {
      needsYou.push({ kind: 'late_case', title: `${c.ref} · ${KIND[c.kind]}`, line: `${c.email ?? 'Signed-in person'} · past the 2-hour reply`, href: '/admin/support', since: c.dueAt });
    }
  }
  needsYou.sort((a, b) => a.since - b.since);

  const today: TodayTile[] = [];
  if (has('profiles')) {
    const fresh = facts.accounts.filter((a) => a.createdAt >= midnight);
    today.push({ key: 'accounts', count: fresh.length, extra: fresh.filter((a) => a.setupDone).length });
  }
  if (has('deals')) {
    const started = facts.deals.filter((d) => d.createdAt >= midnight);
    today.push({ key: 'deals', count: started.length, usdc: usdcOf(started.reduce((n, d) => n + micros(d.amountUsdc), 0)) });
    const held = facts.deals.filter((d) => HELD.has(d.stage));
    today.push({ key: 'held', count: held.length, usdc: usdcOf(held.reduce((n, d) => n + micros(d.amountUsdc), 0)) });
  }
  if (has('support')) {
    const replied = facts.cases.filter((c) => c.firstRepliedAt !== undefined && c.firstRepliedAt >= midnight);
    const minutes = replied.length
      ? Math.round(replied.reduce((n, c) => n + (c.firstRepliedAt! - c.createdAt), 0) / replied.length / 60_000)
      : null;
    today.push({ key: 'support', count: open.length, minutes });
  }

  const latest = new Map<string, number>();
  for (const row of facts.rows) {
    if (!row.memberId || row.at < facts.now - ON_SHIFT_MS) continue;
    latest.set(row.memberId, Math.max(latest.get(row.memberId) ?? 0, row.at));
  }
  const onShift: ShiftRow[] = [];
  for (const [id, lastAt] of latest) {
    const m = facts.members.find((x) => x.id === id);
    if (!m) continue;
    onShift.push({ name: m.name, role: m.role ?? null, lastAt, openCases: open.filter((c) => c.assignee === id).length });
  }
  onShift.sort((a, b) => b.lastAt - a.lastAt);

  const counts: HomeView['counts'] = { waiting: approvals.length };
  if (has('support')) counts.support = open.length;
  if (has('disputes')) counts.disputes = disputed.length;

  return { needsYou, today, system: has('diagnostics') ? facts.system : null, onShift, counts };
}

/// Coarse lifecycle stage, for the deals table and Home.
export function dealStage(d: Pick<DirectDeal, 'cancelledAt' | 'settledAt' | 'disputed' | 'delivered' | 'acceptedAt'>): string {
  if (d.cancelledAt) return 'cancelled';
  if (d.settledAt) return 'settled';
  if (d.disputed) return 'disputed';
  if (d.delivered) return 'delivered';
  if (d.acceptedAt) return 'accepted';
  return 'open';
}
