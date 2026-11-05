import { proposalPendingLines, dealPendingLines } from '../assistant/pendingLines.js';
import { openQuestionsFor } from '../db/agentQuestions.js';
import { progressStore } from '../db/agentProgress.js';
import { getAgentRecord, listAgentRecords, updateAgentRecord } from '../db/agentRecords.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { getBrief } from '../db/briefs.js';
import { listDealsForAddress } from '../db/deals.js';
import { listMatchProposalsForUser } from '../db/matchProposals.js';
import { getProfile, type UserLocale } from '../db/profiles.js';
import { bus, recentEventsByType } from '../events.js';
import { insightsFor, sentRecord } from '../intelligence/insights.js';
import { logger } from '../logger.js';
import type { AgentRecord } from './agentRecord.js';
import { requestTitle } from './bidOutcome.js';
import { goalFits, goalWords, type BriefFacts } from './brief.js';
import { getBuyerSnapshot, type BuyerJobSnapshot } from './buyer.js';
import { briefTick, onOfferOnRequest, type BriefGathered, type PersonAgentDeps } from './personAgent.js';

/// The live stores behind the person agent (view 52, step 4). Reads only what
/// the person already has: their requests and the offers on them, their open
/// questions, the deals waiting on them, what their agent sees, and their goals
/// matched on words against the market.

const TICK_MS = Number(process.env.PERSON_AGENT_TICK_MS ?? 60 * 60 * 1000);
const MONTH_MS = 30 * 86_400_000;

const isOpen = (j: BuyerJobSnapshot, nowSec: number) => !j.finalized && !j.cancelledAt && !j.expiredAt && !j.escrowFunded && j.deadlineUnix > nowSec;
const sentOf = (r: AgentRecord, now: number) => (r.insightsSent ?? []).filter((s) => now - s.at < MONTH_MS);

async function facts(owner: string, record: AgentRecord, now: number) {
  const { gatherFacts } = await import('../intelligence/insightsLive.js');
  return gatherFacts(owner, sentOf(record, now), now);
}

async function gather(owner: string, ctx: { since: number; now: number; record: AgentRecord }): Promise<BriefGathered> {
  const { since, now, record } = ctx;
  const nowSec = Math.floor(now / 1000);
  const wallets = await getAgentWallets(owner).catch(() => null);
  const all = getBuyerSnapshot().jobs;
  const buyerAgent = wallets?.buyerAddress?.toLowerCase();
  const mine = buyerAgent ? all.filter((j) => j.buyer.toLowerCase() === buyerAgent && isOpen(j, nowSec)) : [];
  const mineIds = new Set(mine.map((j) => j.jobId.toLowerCase()));

  const bids = (await recentEventsByType(['bid.submitted'], 500).catch(() => [])).filter((e) => e.ts > since && e.jobId && mineIds.has(e.jobId.toLowerCase()));
  const byJob = new Map<string, { count: number; best: number }>();
  for (const b of bids) {
    const price = Number(b.payload?.priceUsdc);
    const cur = byJob.get(b.jobId!) ?? { count: 0, best: Infinity };
    byJob.set(b.jobId!, { count: cur.count + 1, best: Number.isFinite(price) && price > 0 ? Math.min(cur.best, price) : cur.best });
  }
  const newOffers: BriefFacts['newOffers'] = [...byJob].map(([jobId, v]) => ({
    jobId,
    title: requestTitle(getBrief(jobId)?.briefText) ?? 'Your request',
    count: v.count,
    bestUsdc: Number.isFinite(v.best) ? v.best : 0,
  }));

  const questions = await openQuestionsFor(owner, now).catch(() => []);
  const decideAts = questions.map((q) => q.decideAt).filter((t): t is number => typeof t === 'number');

  const [deals, proposals] = await Promise.all([listDealsForAddress(owner).catch(() => []), listMatchProposalsForUser(owner).catch(() => [])]);
  const dealsWaiting = dealPendingLines(owner, deals, now).actionNeeded.length + proposalPendingLines(owner, proposals, now).actionNeeded.length;

  const insights = await facts(owner, record, now).then((f) => insightsFor(f, now)).catch(() => []);

  const goals: BriefFacts['goals'] = [];
  const market = all.filter((j) => isOpen(j, nowSec) && j.buyer.toLowerCase() !== buyerAgent);
  for (const goal of record.goals ?? []) {
    if (goal.until !== undefined && goal.until < now) {
      goals.push({ goal, line: 'expired', numbers: {} });
      continue;
    }
    const words = goalWords(goal.text);
    const text = (j: BuyerJobSnapshot) => getBrief(j.jobId)?.briefText ?? '';
    if (goal.kind === 'buy') {
      const fits = mine.filter((j) => goalFits(words, text(j)));
      if (!fits.length) {
        goals.push({ goal, line: 'nothing', numbers: {} });
        continue;
      }
      const prices = fits.flatMap((j) => j.bids.map((b) => Number(b.priceUsdc))).filter((p) => p > 0);
      goals.push({ goal, line: 'buy', numbers: { offers: prices.length, bestUsdc: prices.length ? Math.min(...prices) : 0, dueAt: Math.min(...fits.map((j) => j.deadlineUnix * 1000)) } });
      continue;
    }
    if (goal.kind === 'sell') {
      const fits = market.filter((j) => goalFits(words, text(j)));
      if (!fits.length) {
        goals.push({ goal, line: 'nothing', numbers: {} });
        continue;
      }
      const sellerAgent = wallets?.sellerAddress?.toLowerCase();
      const offered = sellerAgent ? fits.filter((j) => j.bids.some((b) => b.seller.toLowerCase() === sellerAgent)).length : 0;
      goals.push({ goal, line: 'sell', numbers: { fits: fits.length, offered } });
      continue;
    }
    const fresh = market.filter((j) => (getBrief(j.jobId)?.createdAt ?? 0) > since && goalFits(words, text(j)));
    goals.push(fresh.length ? { goal, line: 'watch', numbers: { count: fresh.length } } : { goal, line: 'nothing', numbers: {} });
  }

  return {
    newOffers,
    questions: { count: questions.length, firstDecideAt: decideAts.length ? Math.min(...decideAts) : null },
    dealsWaiting,
    insights,
    goals,
  };
}

export const livePersonAgentDeps: PersonAgentDeps = {
  now: Date.now,
  people: () => listAgentRecords(),
  recordFor: (owner) => getAgentRecord(owner),
  locale: async (owner) => ((await getProfile(owner).catch(() => null))?.settings?.locale ?? 'en') as UserLocale,
  // Resolved on use: the database pool opens after this module loads.
  progress: {
    claim: (...a) => progressStore().claim(...a),
    markSent: (...a) => progressStore().markSent(...a),
    toldSince: (...a) => progressStore().toldSince(...a),
    insightsToday: (...a) => progressStore().insightsToday(...a),
    prune: (...a) => progressStore().prune(...a),
  },
  gather,
  ownerOfRequest: async (jobId) => getBrief(jobId)?.postedBy?.toLowerCase() ?? null,
  insightForOffer: async (owner, jobId, now) => {
    const record = await getAgentRecord(owner);
    const found = insightsFor(await facts(owner, record, now), now);
    return found.find((i) => i.kind === 'cheaper-better-sellers' && i.jobId?.toLowerCase() === jobId.toLowerCase()) ?? null;
  },
  emit: (e) => bus.emitEvent({ type: e.type, actor: 'platform', ...(e.data.jobId ? { jobId: e.data.jobId } : {}), payload: { user: e.user, sellerUser: e.user, ...e.data } }),
  closeGoals: async (owner, ids) => {
    await updateAgentRecord(owner, (r) => ({ ...r, goals: (r.goals ?? []).filter((g) => !ids.includes(g.id)) }));
  },
  markInsightsSent: async (owner, insights, now) => {
    await updateAgentRecord(owner, (r) => ({ ...r, insightsSent: [...sentOf(r, now), ...insights.map((i) => sentRecord(i, now))] }));
  },
};

/// Starts the hourly brief tick and the live note on new offers. Returns a stop.
export function startPersonAgent(deps: PersonAgentDeps = livePersonAgentDeps): () => void {
  let lastPrune = 0;
  const tick = async () => {
    const now = deps.now();
    await briefTick(deps);
    if (now - lastPrune > 86_400_000) {
      lastPrune = now;
      await deps.progress.prune(now - MONTH_MS).catch((err: Error) => logger.warn({ err: err.message }, 'progress log prune failed'));
    }
  };
  const run = () => void tick().catch((err: Error) => logger.error({ err: err.message }, 'person agent tick failed'));
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, TICK_MS);
  const stopBids = bus.subscribe((e) => {
    if (e.type !== 'bid.submitted' || !e.jobId) return;
    void onOfferOnRequest(deps, e.jobId).catch((err: Error) => logger.warn({ jobId: e.jobId, err: err.message }, 'person agent live note failed'));
  });
  logger.info({ tickMs: TICK_MS }, 'person agent started');
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    stopBids();
  };
}
