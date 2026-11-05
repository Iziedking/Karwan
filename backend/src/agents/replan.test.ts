import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentQuestion, QuestionAnswer } from '../db/agentQuestions.js';
import { newAgentRecord } from './agentRecord.js';
import { mandateOf } from './mandate.js';
import { replan, type ReplanDeps } from './replan.js';

///   npx tsx --test src/agents/replan.test.ts

const NOW = Date.UTC(2026, 10, 5, 9);
const OWNER = '0xowner';

function q(id: string, jobId: string, kind: AgentQuestion['kind'], state: AgentQuestion['state'], budgetUsdc: number, answer: QuestionAnswer | null = null): AgentQuestion {
  return {
    id, owner: OWNER, side: 'seller', jobId, kind, title: jobId, facts: { budgetUsdc }, suggested: {}, state, answer, mandateVersion: 1,
    createdAt: NOW - 3_600_000, updatedAt: NOW, remindedAt: null, defaultChoice: 'no', defaultPriceUsdc: null, decideAt: null,
  };
}

const before = mandateOf(
  { agentWays: { sell: [{ shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 3, daysMax: 5 }], buy: [] }, agentPrefs: { agentMode: 'ask' } },
  newAgentRecord(OWNER),
  [],
);

function stubs(questions: AgentQuestion[], offeredOn: string[] = []) {
  const calls = { forgot: [] as string[][], matched: 0, answered: [] as Array<{ id: string; answer: QuestionAnswer }> };
  const deps: ReplanDeps = {
    now: () => NOW,
    questionsSince: async () => questions,
    openQuestionsFor: async () => questions.filter((x) => x.state === 'input-required'),
    forgetJudgedFor: async (_owner, jobIds) => {
      calls.forgot.push([...jobIds]);
      return jobIds.length;
    },
    matchSellerNow: async () => {
      calls.matched += 1;
      return offeredOn.length + 1;
    },
    hasOfferOn: (jobId) => offeredOn.includes(jobId),
    answerQuestion: async (id, _owner, answer) => {
      calls.answered.push({ id, answer });
      return questions.find((x) => x.id === id) ?? null;
    },
  };
  return { deps, calls };
}

test('lowerPriceReopensOnlyFits', async () => {
  const questions = [
    q('q1', 'job-a', 'price-below-floor', 'expired', 35),
    q('q2', 'job-b', 'price-below-floor', 'input-required', 32),
    q('q3', 'job-c', 'price-below-floor', 'answered', 20, { choice: 'no' }),
    q('q4', 'job-d', 'time', 'input-required', 50),
  ];
  const { deps, calls } = stubs(questions, ['job-b']);
  const r = await replan(OWNER, before, { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, deps);
  assert.deepEqual(calls.forgot, [['job-a', 'job-b']]);
  assert.equal(calls.matched, 1);
  assert.equal(r.offered, 1);
  assert.deepEqual(calls.answered, [{ id: 'q2', answer: { choice: 'yes', by: 'replan' } }]);
  assert.equal(r.closedQuestions, 1);
  assert.equal(r.judged, 2);
  assert.equal(r.line, 'Done. Your agent looked again at 2 of the requests you passed on, now at 30 USDC, and 1 became an offer.');
});

test('a price change that reopens nothing still refreshes the seller agent, so a raised price applies now', async () => {
  const { deps, calls } = stubs([q('q1', 'job-a', 'price-below-floor', 'expired', 20)]);
  const r = await replan(OWNER, before, { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, deps);
  assert.equal(calls.matched, 1);
  assert.equal(calls.forgot.length, 0);
  assert.equal(r.judged, 0);
  assert.equal(r.line, 'Done. Your agent works this way from now on.');
});

test('modeLeavingAskClosesAskFirst', async () => {
  const questions = [q('q1', 'job-a', 'ask-first', 'input-required', 50), q('q2', 'job-b', 'price-below-floor', 'input-required', 20)];
  const { deps, calls } = stubs(questions);
  const r = await replan(OWNER, before, { part: 'alone', mode: 'offers' }, deps);
  assert.deepEqual(calls.answered, [{ id: 'q1', answer: { choice: 'yes', by: 'replan' } }]);
  assert.deepEqual(calls.forgot, [['job-a']]);
  assert.equal(calls.matched, 1);
  assert.equal(r.closedQuestions, 1);
  assert.equal(r.line, 'Done. Your agent closed the questions it no longer needs (1) and is looking at those requests again.');
  const stay = stubs(questions);
  const r2 = await replan(OWNER, { ...before, alone: 'offers' }, { part: 'alone', mode: 'agree' }, stay.deps);
  assert.equal(stay.calls.answered.length, 0);
  assert.equal(stay.calls.matched, 1);
  assert.equal(r2.line, 'Done. Your agent works this way from now on.');
});

test('limitChangeDoesNothingElse', async () => {
  for (const patch of [{ part: 'weekly-limit', usdc: 1 }, { part: 'buy-most', usdc: 90 }, { part: 'brief', hour: 9 }, { part: 'quiet-off' }] as const) {
    const { deps, calls } = stubs([q('q1', 'job-a', 'price-below-floor', 'expired', 35)]);
    const r = await replan(OWNER, before, patch, deps);
    assert.equal(calls.matched + calls.forgot.length + calls.answered.length, 0, patch.part);
    assert.equal(r.line, 'Done. Your agent works this way from now on.');
  }
});

test('failureKeepsTheChangeAndSaysSo', async () => {
  const { deps } = stubs([q('q1', 'job-a', 'price-below-floor', 'expired', 35)]);
  deps.matchSellerNow = async () => {
    throw new Error('rpc down');
  };
  const r = await replan(OWNER, before, { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, deps);
  assert.equal(r.failed, true);
  assert.equal(r.line, 'Saved. Your agent is still re-checking your requests and finishes on its next sweep.');
});

test('replan lines have no empty slot in every language', async () => {
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const { deps } = stubs([q('q1', 'job-a', 'price-below-floor', 'input-required', 35), q('q2', 'job-b', 'ask-first', 'input-required', 35)], ['job-a']);
    for (const patch of [{ part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, { part: 'alone', mode: 'offers' }, { part: 'quiet-off' }] as const) {
      const r = await replan(OWNER, before, patch, deps, locale);
      assert.doesNotMatch(r.line, /\{\w+\}|—|undefined|NaN/, `${locale} ${patch.part}: ${r.line}`);
    }
  }
});
