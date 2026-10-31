import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { DealDisputeView, DisputeProposalView } from '@/core/api';
import { problemSteps } from './problemSteps';

const CLOSES = Date.UTC(2026, 10, 5);
const base: DealDisputeView = { closesAt: CLOSES, open: true, otherSubmitted: false, statements: {} };
const proposal: DisputeProposalView = { sellerBps: 0, items: [], confidence: 'clear', summary: '', rule: 'silent-seller', proposedAt: CLOSES, status: 'awaiting-review' };
const states = (r: ReturnType<typeof problemSteps>) => r.steps.map((s) => `${s.key}:${s.state}`);

test('while the other side has not answered and the date is ahead, their answer is the current step', () => {
  const r = problemSteps(base, CLOSES - 1);
  assert.deepEqual(states(r), ['opened:done', 'answer:current', 'decides:upcoming']);
  assert.equal(r.answerPassed, false);
});

test('once the other side answered, Karwan deciding is the current step', () => {
  assert.deepEqual(states(problemSteps({ ...base, otherSubmitted: true }, CLOSES - 1)), ['opened:done', 'answer:done', 'decides:current']);
});

test('a passed answer date says so instead of showing a date in the past as pending', () => {
  const r = problemSteps({ ...base, open: false }, CLOSES + 1);
  assert.deepEqual(states(r), ['opened:done', 'answer:done', 'decides:current']);
  assert.equal(r.answerPassed, true);
  assert.equal(problemSteps(base, CLOSES + 1).answerPassed, true);
});

test('a proposed ruling waiting for review keeps Karwan deciding current', () => {
  assert.deepEqual(states(problemSteps({ ...base, open: false, proposal }, CLOSES + 1)), ['opened:done', 'answer:done', 'decides:current']);
});

test('a confirmed or overridden ruling closes every step', () => {
  for (const status of ['confirmed', 'overridden'] as const) {
    assert.deepEqual(states(problemSteps({ ...base, open: false, proposal: { ...proposal, status } }, CLOSES + 1)), ['opened:done', 'answer:done', 'decides:done']);
  }
});
