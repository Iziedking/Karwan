import { listAgentRecords, updateAgentRecord } from '../db/agentRecords.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { weeklyLineDue, weeklyWindowOpen } from './agentRecord.js';
import { insightsFor, sentRecord, type Insight, type InsightFacts } from '../intelligence/insights.js';
import { RECORD_READ_PRICE_USDC } from '../x402/recordReadGate.js';

/// The reporter (view 48, step 6). Once a day it sends each person whose
/// weekly line is on, and whose agents paid for data in the last week, one
/// line on what they spent and what for. Fits, shortlists and market watches
/// already reach people as their own events.

const TICK_MS = Number(process.env.AGENT_REPORT_TICK_MS ?? 24 * 60 * 60 * 1000);

/// What is left in the person's data balance, or null when unknown.
type DataBalance = (owner: string) => Promise<number | null>;
const liveDataBalance: DataBalance = async (owner) => (await import('../x402/buyerClient.js')).dataBalanceUsd(owner);

/// The facts behind a person's insights (view 52, step 1).
type Facts = (owner: string, sent: InsightFacts['sent'], now: number) => Promise<InsightFacts>;
const liveFacts: Facts = async (owner, sent, now) => (await import('../intelligence/insightsLive.js')).gatherFacts(owner, sent, now);

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/// The questions the agent asked the person this week and how they ended (view 52, step 2).
export interface QuestionCounts { asked: number; answered: number; byDefault: number }
type Questions = (owner: string, since: number) => Promise<QuestionCounts>;
const liveQuestions: Questions = async (owner, since) => {
  const asked = await (await import('../db/agentQuestions.js')).questionsSince(owner, since);
  return {
    asked: asked.length,
    answered: asked.filter((q) => q.state === 'answered' && q.answer?.by !== 'default').length,
    byDefault: asked.filter((q) => q.answer?.by === 'default').length,
  };
};

/// What the weekly payload carries for each insight: numbers and the action, never a sentence.
export function insightPayload(i: Insight): Record<string, unknown> {
  return { kind: i.kind, ...(i.title ? { title: i.title } : {}), ...(i.jobId ? { jobId: i.jobId } : {}), numbers: i.numbers, action: i.action };
}

export async function sendWeeklyLines(now = Date.now(), dataBalance: DataBalance = liveDataBalance, facts: Facts = liveFacts, questions: Questions = liveQuestions): Promise<number> {
  let sent = 0;
  for (const r of await listAgentRecords()) {
    if (!weeklyWindowOpen(r, now)) continue;
    const told = (r.insightsSent ?? []).filter((s) => now - s.at < MONTH_MS);
    const insights = await facts(r.owner, told, now).then((f) => insightsFor(f, now)).catch((err: Error) => {
      logger.warn({ owner: r.owner, err: err.message }, 'weekly insights failed; sending the spend line alone');
      return [] as Insight[];
    });
    const asked = await questions(r.owner, now - WEEK_MS).catch(() => ({ asked: 0, answered: 0, byDefault: 0 }));
    const line = weeklyLineDue(r, now) ?? (insights.length || asked.asked ? { totalUsdc: 0, recordChecks: 0, webSearches: 0 } : null);
    if (!line) continue;
    await updateAgentRecord(r.owner, (cur) => ({ ...cur, lastWeeklyAt: now, insightsSent: [...told, ...insights.map((i) => sentRecord(i, now))] }));
    const left = await dataBalance(r.owner).catch(() => null);
    bus.emitEvent({
      type: 'agent.weekly',
      actor: 'platform',
      // `user` reaches Telegram; `sellerUser` is how the app addresses a personal notice.
      // The price of one check and what is left of the data balance, so the line says it plainly (owner, 5 Nov 2026).
      payload: {
        user: r.owner,
        sellerUser: r.owner,
        ...line,
        budgetUsdc: r.weeklyBudgetUsdc,
        checkPriceUsdc: RECORD_READ_PRICE_USDC,
        ...(left !== null ? { dataBalanceUsdc: Number(left.toFixed(6)) } : {}),
        ...(insights.length ? { insights: insights.map(insightPayload) } : {}),
        ...(asked.asked ? { questions: asked } : {}),
      },
    });
    sent += 1;
  }
  return sent;
}

export function startAgentReporter(): () => void {
  const timer = setInterval(() => {
    sendWeeklyLines().catch((err: Error) => logger.error({ err: err.message }, 'agent weekly lines failed'));
  }, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'agent reporter started');
  return () => clearInterval(timer);
}
