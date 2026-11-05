import { z } from 'zod';
import { MAX_WEEKLY_BUDGET_USDC, spentThisWeek, type AgentRecord } from './agentRecord.js';

/// The agent's weekly limit as Money shows it (view 51, third round). It is
/// the weekly data budget every paid check is gated on (x402/dataGate.ts).

const CHOICES = [0.5, 1, 5];
const WEEK_MS = 7 * 86_400_000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export const agentLimitSchema = z.object({ weeklyUsdc: z.number().min(0).max(MAX_WEEKLY_BUDGET_USDC) });

export interface AgentLimitView {
  weeklyUsdc: number;
  spentUsdc: number;
  leftUsdc: number;
  recordChecks: number;
  webSearches: number;
  maxUsdc: number;
  choices: number[];
}

export function agentLimitView(r: AgentRecord, now: number): AgentLimitView {
  const week = r.spend.filter((s) => now - s.at < WEEK_MS && s.at <= now);
  const spent = spentThisWeek(r, now);
  return {
    weeklyUsdc: r.weeklyBudgetUsdc,
    spentUsdc: spent,
    leftUsdc: Math.max(0, round6(r.weeklyBudgetUsdc - spent)),
    recordChecks: week.filter((s) => s.kind === 'record').length,
    webSearches: week.filter((s) => s.kind === 'research').length,
    maxUsdc: MAX_WEEKLY_BUDGET_USDC,
    choices: [...new Set([r.weeklyBudgetUsdc, ...CHOICES])].sort((a, b) => a - b),
  };
}
