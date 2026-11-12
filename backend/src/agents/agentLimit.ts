import { z } from 'zod';
import { MAX_WEEKLY_BUDGET_USDC, spentThisWeek, type AgentRecord } from './agentRecord.js';
import type { LocalCurrency, UsdcRates } from '../rates/usdcRates.js';

/// The agent's weekly limit as Money shows it (view 51, third round). It is
/// the weekly data budget every paid check is gated on (x402/dataGate.ts).

const CHOICES = [0.5, 1, 5];
const WEEK_MS = 7 * 86_400_000;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export const agentLimitSchema = z.object({ weeklyUsdc: z.number().min(0).max(MAX_WEEKLY_BUDGET_USDC) });

/// A weekly limit said in the person's own currency (view 77): the figure said
/// is the rule, kept beside the USDC it gave. Null when it was said in USDC.
export function saidLimit(weeklyUsdc: number, said: { currency: LocalCurrency; amounts: Record<string, number> } | undefined): AgentRecord['weeklySaid'] {
  const amount = said?.amounts.weeklyUsdc;
  if (!said || typeof amount !== 'number' || !(amount > 0)) return undefined;
  return { currency: said.currency, amount: String(Math.round(amount * 100) / 100), usdc: weeklyUsdc };
}

/// The record with its said limit at the rate given. A limit whose USDC was
/// changed some other way (a choice tapped on Money) no longer matches, and its
/// figure is dropped. The ceiling still holds, so a falling currency never
/// lifts the limit past it. With no rate the limit keeps its last USDC.
export function limitAtRate(r: AgentRecord, rates: UsdcRates): AgentRecord {
  const said = r.weeklySaid;
  if (!said) return r;
  if (said.usdc !== r.weeklyBudgetUsdc) return { ...r, weeklySaid: undefined };
  const rate = rates.rates[said.currency];
  if (!rate || rates.updatedAt === null) return r;
  const usdc = Math.min(MAX_WEEKLY_BUDGET_USDC, round6(Number(said.amount) / rate));
  if (!(usdc > 0) || usdc === r.weeklyBudgetUsdc) return r;
  return { ...r, weeklyBudgetUsdc: usdc, weeklySaid: { ...said, usdc } };
}

/// Brings every said weekly limit to the rate in force. Returns how many changed.
export async function refreshSaidLimits(deps: {
  list: () => Promise<AgentRecord[]>;
  rates: () => Promise<UsdcRates>;
  save: (owner: string, change: (r: AgentRecord) => AgentRecord) => Promise<unknown>;
}): Promise<number> {
  const rates = await deps.rates();
  if (rates.updatedAt === null) return 0;
  let n = 0;
  for (const r of await deps.list()) {
    if (!r.weeklySaid || limitAtRate(r, rates) === r) continue;
    await deps.save(r.owner, (cur) => limitAtRate(cur, rates));
    n += 1;
  }
  return n;
}

export interface AgentLimitView {
  weeklyUsdc: number;
  /// The limit as it was said, when it still stands (view 77).
  weeklyLocal?: { currency: LocalCurrency; amount: string };
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
    ...(r.weeklySaid && r.weeklySaid.usdc === r.weeklyBudgetUsdc ? { weeklyLocal: { currency: r.weeklySaid.currency, amount: r.weeklySaid.amount } } : {}),
    spentUsdc: spent,
    leftUsdc: Math.max(0, round6(r.weeklyBudgetUsdc - spent)),
    recordChecks: week.filter((s) => s.kind === 'record').length,
    webSearches: week.filter((s) => s.kind === 'research').length,
    maxUsdc: MAX_WEEKLY_BUDGET_USDC,
    choices: [...new Set([r.weeklyBudgetUsdc, ...CHOICES])].sort((a, b) => a - b),
  };
}
