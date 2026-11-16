/// The person's agent record (view 48, step 6). One per account: a weekly
/// budget for the data its agents pay for (owner, 3 Nov 2026: 0.25 USDC, and
/// the agent asks before going over), what they spent in the last 7 days, and
/// the weekly spend line, on by default. Pure; the store keeps it.

import type { BriefPrefs, Goal, QuietHours } from './mandate.js';
import type { LocalCurrency } from '../rates/usdcRates.js';

export const DEFAULT_WEEKLY_BUDGET_USDC = 0.25;
export const MAX_WEEKLY_BUDGET_USDC = 5;
const WEEK_MS = 7 * 86_400_000;

export type SpendKind = 'record' | 'research';

export interface AgentRecord {
  owner: string;
  weeklyBudgetUsdc: number;
  /// The limit as it was said in the person's own currency, with the USDC it
  /// last gave (view 77). The figure said is the rule; see agentLimit.ts.
  weeklySaid?: { currency: LocalCurrency; amount: string; usdc: number };
  weeklyReport: boolean;
  spend: Array<{ at: number; usd: number; kind: SpendKind }>;
  lastWeeklyAt?: number;
  lastBudgetNoticeAt?: number;
  /// What the agent told the person about how they trade (view 52): the key,
  /// when, and the number it turned on. Kept 30 days.
  insightsSent?: Array<{ key: string; at: number; value: number }>;
  /// The mandate's new parts (view 52, step 3). Absent reads as the defaults
  /// in mandate.ts; quiet null means quiet hours are off.
  goals?: Goal[];
  brief?: BriefPrefs;
  quiet?: QuietHours | null;
  /// Set when the agent stopped itself (view 87). Until the person turns it
  /// back on, it does nothing alone.
  stopped?: { at: number; reason: StopReason };
  /// Lock steps that failed one after another; a lock that works clears it.
  lockFailures?: number;
  /// The limits for locking money alone (view 87), set with the passkey.
  lock?: LockRules;
}

export type LockWho = 'verified' | 'record' | 'anyone';
/// An amount with the figure the person typed, when they typed it in their
/// own currency (view 77).
export interface SaidUsdc { usdc: number; said?: { currency: LocalCurrency; amount: string } }
export interface LockRules {
  perDeal: SaidUsdc;
  perWeek: SaidUsdc;
  perDay: number;
  who: LockWho;
  locks: Array<{ at: number; usdc: number; jobId: string }>;
}
export const DEFAULT_LOCKS_PER_DAY = 3;
export const MAX_LOCKS_PER_DAY = 10;
export const DEFAULT_LOCK_WHO: LockWho = 'record';

export type StopReason = 'locks-today' | 'lock-failures' | 'not-family';
export const LOCK_FAILURES_BEFORE_STOP = 3;

export function stopAgent(r: AgentRecord, reason: StopReason, now: number): AgentRecord {
  return r.stopped ? r : { ...r, stopped: { at: now, reason } };
}

export function resumeAgent(r: AgentRecord): AgentRecord {
  const { stopped: _stopped, lockFailures: _failures, ...rest } = r;
  return rest;
}

/// A lock step that failed. The third in a row stops the agent.
export function lockFailed(r: AgentRecord, now: number): AgentRecord {
  const lockFailures = (r.lockFailures ?? 0) + 1;
  const next = { ...r, lockFailures };
  return lockFailures >= LOCK_FAILURES_BEFORE_STOP ? stopAgent(next, 'lock-failures', now) : next;
}

export function lockWorked(r: AgentRecord): AgentRecord {
  if (!r.lockFailures) return r;
  const { lockFailures: _failures, ...rest } = r;
  return rest;
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
