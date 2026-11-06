import { bus, type KarwanEvent } from '../events.js';
import { logger } from '../logger.js';
import { closeBuyerQuestion } from './agentQuestion.js';
import { decideByDefault, dueDefaults, dueReminders, expireQuestionsForJob, markReminded, type AgentQuestion } from '../db/agentQuestions.js';
import { getBrief } from '../db/briefs.js';
import { leased } from '../ops/leasedLoop.js';

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
      ...(q.defaultChoice ? { defaultChoice: q.defaultChoice, decideAt: q.decideAt } : {}),
      reminder: true,
    },
  };
}

/// The kinds the seller answers on a live counter; No ends that negotiation.
const COUNTER_KINDS: ReadonlySet<AgentQuestion['kind']> = new Set(['counter-below-floor', 'last-price-passed']);

export interface DefaultDeps {
  due(now: number): Promise<AgentQuestion[]>;
  decide(id: string, now: number): Promise<AgentQuestion | null>;
  /// The same step pressing No on a counter question runs.
  counterNo(jobId: string, sellerUser: string): Promise<unknown>;
  emit(e: Omit<KarwanEvent, 'ts'>): void;
}

const liveDefaultDeps: DefaultDeps = {
  due: (now) => dueDefaults(now),
  decide: (id, now) => decideByDefault(id, now),
  counterNo: async (jobId, sellerUser) => (await import('./seller.js')).answerCounterQuestion(jobId, sellerUser, { choice: 'no' }),
  emit: (e) => bus.emitEvent(e),
};

/// Questions nobody answered in time get their stated default, once (view 52,
/// step 2): the same as pressing No, then the person is told and the other
/// side's "checking" line clears. Returns how many ran.
export async function runDefaults(now: number, deps: DefaultDeps = liveDefaultDeps): Promise<number> {
  let ran = 0;
  for (const due of await deps.due(now)) {
    const q = await deps.decide(due.id, now);
    if (!q) continue;
    ran += 1;
    if (q.side === 'seller' && COUNTER_KINDS.has(q.kind)) {
      await deps.counterNo(q.jobId, q.owner).catch((err: Error) => logger.warn({ jobId: q.jobId, err: err.message }, 'default no on a counter failed'));
    }
    deps.emit({
      type: 'agent.question.decided',
      actor: q.side,
      payload: { ...(q.side === 'seller' ? { sellerUser: q.owner } : { buyerUser: q.owner }), jobId: q.jobId, questionId: q.id, kind: q.kind, title: q.title, choice: q.answer?.choice ?? 'no' },
    });
    const counterpart = q.side === 'seller' ? getBrief(q.jobId)?.postedBy : null;
    if (counterpart) {
      deps.emit({ type: 'agent.question.waiting', actor: q.side, payload: { buyerUser: counterpart.toLowerCase(), jobId: q.jobId, checking: null } });
    }
  }
  return ran;
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
      await runDefaults(now);
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
  const run = leased('questionSweep', SWEEP_INTERVAL_MS, sweep);
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
