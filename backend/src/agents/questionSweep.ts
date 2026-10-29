import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { closeBuyerQuestion } from './agentQuestion.js';
import { dueReminders, expireQuestionsForJob, markReminded, type AgentQuestion } from '../db/agentQuestions.js';

const SWEEP_INTERVAL_MS = 60_000;

/// A request that closes takes its open questions with it: it expired, or a
/// seller's offer was taken.
export const CLOSES_REQUEST: ReadonlySet<KarwanEvent['type']> = new Set(['job.expired', 'bid.accepted', 'escrow.funded']);

/// The buyer answered their near match on its own card.
const NEAR_MATCH_ANSWERED: Partial<Record<KarwanEvent['type'], 'yes' | 'no'>> = {
  'negotiation.near-miss.proceeded': 'yes',
  'negotiation.near-miss.declined': 'no',
  'negotiation.near-miss.superseded': 'no',
};

/// The reminder rides the same event as the question, marked, so the bell,
/// email and Telegram say it once more (view 41: one reminder, 30 minutes on).
export function reminderEvent(q: AgentQuestion): Omit<KarwanEvent, 'ts'> {
  return {
    type: 'agent.suggestion',
    actor: q.side,
    payload: {
      ...(q.side === 'seller' ? { sellerUser: q.owner } : { buyerUser: q.owner }),
      jobId: q.jobId,
      questionId: q.id,
      kind: q.kind,
      title: q.title,
      ...q.facts,
      priceUsdc: q.suggested.priceUsdc,
      days: q.suggested.days,
      reminder: true,
    },
  };
}

export function startQuestionSweep(): () => void {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      for (const q of await dueReminders(now)) {
        await markReminded(q.id, now);
        bus.emitEvent(reminderEvent(q));
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'agent question sweep failed');
    } finally {
      running = false;
    }
  };
  const unsubscribe = bus.subscribe((e) => {
    if (!e.jobId) return;
    const answered = NEAR_MATCH_ANSWERED[e.type];
    if (answered) {
      const buyer = String(e.payload?.buyer ?? e.payload?.buyerUser ?? '');
      const seller = typeof e.payload?.sellerUser === 'string' ? e.payload.sellerUser : null;
      if (buyer) void closeBuyerQuestion(buyer, e.jobId, answered, seller).catch(() => {});
      return;
    }
    if (!CLOSES_REQUEST.has(e.type)) return;
    void expireQuestionsForJob(e.jobId).catch((err: Error) => logger.warn({ jobId: e.jobId, err: err.message }, 'closing agent questions failed'));
  });
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
