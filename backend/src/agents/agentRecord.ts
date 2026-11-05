/// The person's agent record (view 48, step 6). One per account: a weekly
/// budget for the data its agents pay for (owner, 3 Nov 2026: 0.25 USDC, and
/// the agent asks before going over), what they spent in the last 7 days, and
/// the weekly spend line, on by default. Pure; the store keeps it.

export const DEFAULT_WEEKLY_BUDGET_USDC = 0.25;
export const MAX_WEEKLY_BUDGET_USDC = 5;
const WEEK_MS = 7 * 86_400_000;

export type SpendKind = 'record' | 'research';

export interface AgentRecord {
  owner: string;
  weeklyBudgetUsdc: number;
  weeklyReport: boolean;
  spend: Array<{ at: number; usd: number; kind: SpendKind }>;
  lastWeeklyAt?: number;
  lastBudgetNoticeAt?: number;
  /// What the agent told the person about how they trade (view 52): the key,
  /// when, and the number it turned on. Kept 30 days.
  insightsSent?: Array<{ key: string; at: number; value: number }>;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function newAgentRecord(owner: string): AgentRecord {
  return { owner: owner.toLowerCase(), weeklyBudgetUsdc: DEFAULT_WEEKLY_BUDGET_USDC, weeklyReport: true, spend: [] };
}

const thisWeek = (r: AgentRecord, now: number) => r.spend.filter((s) => now - s.at < WEEK_MS && s.at <= now);

export function spentThisWeek(r: AgentRecord, now: number): number {
  return round6(thisWeek(r, now).reduce((sum, s) => sum + s.usd, 0));
}

/// Whether one more payment of this price stays inside the weekly budget.
export function canSpend(r: AgentRecord, priceUsd: number, now: number): boolean {
  return round6(spentThisWeek(r, now) + priceUsd) <= r.weeklyBudgetUsdc;
}

export function addSpend(r: AgentRecord, usd: number, kind: SpendKind, now: number): AgentRecord {
  return { ...r, spend: [...thisWeek(r, now), { at: now, usd, kind }] };
}

/// The weekly message may go out: it is on and a week has passed since the last.
export function weeklyWindowOpen(r: AgentRecord, now: number): boolean {
  return r.weeklyReport && (r.lastWeeklyAt === undefined || now - r.lastWeeklyAt >= WEEK_MS);
}

/// The weekly line, when it is due: on, a week since the last one, and
/// something spent in that week.
export function weeklyLineDue(r: AgentRecord, now: number): { totalUsdc: number; recordChecks: number; webSearches: number } | null {
  if (!r.weeklyReport) return null;
  if (r.lastWeeklyAt !== undefined && now - r.lastWeeklyAt < WEEK_MS) return null;
  const week = thisWeek(r, now);
  if (week.length === 0) return null;
  return {
    totalUsdc: spentThisWeek(r, now),
    recordChecks: week.filter((s) => s.kind === 'record').length,
    webSearches: week.filter((s) => s.kind === 'research').length,
  };
}

/// The "budget reached" notice goes out at most once in 7 days.
export function budgetNoticeDue(r: AgentRecord, now: number): boolean {
  return r.lastBudgetNoticeAt === undefined || now - r.lastBudgetNoticeAt >= WEEK_MS;
}
