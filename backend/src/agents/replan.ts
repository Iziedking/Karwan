import type { AgentQuestion, QuestionAnswer } from '../db/agentQuestions.js';
import type { UserLocale } from '../db/profiles.js';
import { tg } from '../i18n/telegram.js';
import { logger } from '../logger.js';
import type { Mandate, MandatePatch } from './mandate.js';

/// After a confirmed mandate change, the agent acts on it at once instead of at
/// the next sweep (view 52, step 3). A lower selling price looks again at the
/// requests the agent passed on for price this week; leaving "ask first"
/// closes those questions and judges the requests again. Other changes need
/// nothing now: the data gate reads the weekly limit, new requests read the
/// buying limit, and the next wake reads goals, the brief and quiet hours.

const WEEK_MS = 7 * 86_400_000;

export interface ReplanDeps {
  now(): number;
  questionsSince(owner: string, since: number): Promise<AgentQuestion[]>;
  openQuestionsFor(owner: string, now: number): Promise<AgentQuestion[]>;
  forgetJudgedFor(owner: string, jobIds: readonly string[]): Promise<number>;
  matchSellerNow(owner: string): Promise<number>;
  hasOfferOn(jobId: string, owner: string): boolean | Promise<boolean>;
  answerQuestion(id: string, owner: string, answer: QuestionAnswer, now: number): Promise<AgentQuestion | null>;
}

export interface Replan { judged: number; offered: number; closedQuestions: number; failed?: true; line: string }

const MOOT: QuestionAnswer = { choice: 'yes', by: 'replan' };
const num = (n: number) => String(Math.round(n * 100) / 100);

const wasPassedOrOpen = (q: AgentQuestion) =>
  q.side === 'seller' && q.kind === 'price-below-floor' && (q.state === 'input-required' || q.state === 'expired' || (q.state === 'answered' && q.answer?.choice === 'no'));

/// The requests a lower selling price could reopen: asked about for price and
/// not offered on, still open or passed. The card and the re-plan read the same.
export function passedForPrice(questions: readonly AgentQuestion[]): Array<{ jobId: string; budgetUsdc: number }> {
  return questions.filter(wasPassedOrOpen).map((q) => ({ jobId: q.jobId, budgetUsdc: Number(q.facts.budgetUsdc) })).filter((r) => r.budgetUsdc > 0);
}

async function offersOn(jobIds: readonly string[], owner: string, deps: ReplanDeps): Promise<string[]> {
  const out: string[] = [];
  for (const j of jobIds) if (await deps.hasOfferOn(j, owner)) out.push(j);
  return out;
}

export async function replan(owner: string, before: Mandate, p: MandatePatch, deps: ReplanDeps, locale: UserLocale = 'en'): Promise<Replan> {
  const done = (): Replan => ({ judged: 0, offered: 0, closedQuestions: 0, line: tg('replan.done', locale) });
  try {
    const now = deps.now();
    if (p.part === 'sell-price') {
      const old = before.sell.find((w) => w.shape === p.shape)?.lowestUsdc ?? Infinity;
      const asked = (await deps.questionsSince(owner, now - WEEK_MS)).filter(wasPassedOrOpen);
      const fits = asked.filter((q) => {
        const budget = Number(q.facts.budgetUsdc);
        return budget >= p.lowestUsdc && budget < old;
      });
      const jobIds = [...new Set(fits.map((q) => q.jobId))];
      if (jobIds.length) await deps.forgetJudgedFor(owner, jobIds);
      // Always: the match reads the saved price again, so a raised one applies now.
      await deps.matchSellerNow(owner);
      if (jobIds.length === 0) return done();
      const offeredOn = await offersOn(jobIds, owner, deps);
      let closedQuestions = 0;
      for (const q of fits) {
        if (q.state === 'input-required' && offeredOn.includes(q.jobId) && (await deps.answerQuestion(q.id, owner, MOOT, now))) closedQuestions += 1;
      }
      const offered = offeredOn.length;
      const key = offered === 0 ? 'replan.reopenedNone' : offered === 1 ? 'replan.reopenedOne' : 'replan.reopened';
      return { judged: jobIds.length, offered, closedQuestions, line: tg(key, locale, { judged: String(jobIds.length), lowest: num(p.lowestUsdc), offered: String(offered) }) };
    }
    if (p.part === 'alone') {
      const leavingAsk = before.alone === 'ask' && p.mode !== 'ask';
      const open = leavingAsk ? (await deps.openQuestionsFor(owner, now)).filter((q) => q.side === 'seller' && q.kind === 'ask-first') : [];
      let closedQuestions = 0;
      const jobIds: string[] = [];
      for (const q of open) {
        if (await deps.answerQuestion(q.id, owner, MOOT, now)) {
          closedQuestions += 1;
          jobIds.push(q.jobId);
        }
      }
      if (jobIds.length) await deps.forgetJudgedFor(owner, jobIds);
      await deps.matchSellerNow(owner);
      if (jobIds.length === 0) return done();
      const offered = (await offersOn(jobIds, owner, deps)).length;
      return { judged: jobIds.length, offered, closedQuestions, line: tg('replan.askClosed', locale, { count: String(closedQuestions) }) };
    }
    return done();
  } catch (err) {
    logger.warn({ owner, part: p.part, err: (err as Error).message }, 'mandate re-plan failed; the change is saved and the sweep picks it up');
    return { judged: 0, offered: 0, closedQuestions: 0, failed: true, line: tg('replan.failed', locale) };
  }
}
