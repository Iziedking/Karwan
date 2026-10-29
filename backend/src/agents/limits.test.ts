import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limitDecision } from './limits.js';

///   npx tsx --test src/agents/limits.test.ts

const NOW = 1_800_000_000;
const DAY = 86_400;
const seller = { minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 1, maxDeadlineDays: 5 };
const job = (budgetUsdc: string, days: number) => ({ budgetUsdc, deadlineUnix: NOW + days * DAY });

test('inside every limit the agent acts', () => {
  assert.deepEqual(limitDecision({ seller, job: job('30', 3), nowUnix: NOW, hasWay: true }), { act: true });
});

test('a request of a kind the person has no way for is a question, with the budget as the suggestion', () => {
  const d = limitDecision({ seller, job: job('100', 3), nowUnix: NOW, hasWay: false });
  assert.deepEqual(d, { act: false, kind: 'no-way', suggested: { priceUsdc: '100', days: 3 }, limit: null });
});

test('under the floor asks, suggesting the floor', () => {
  const d = limitDecision({ seller, job: job('12', 3), nowUnix: NOW, hasWay: true });
  assert.deepEqual(d, { act: false, kind: 'price-below-floor', suggested: { priceUsdc: '20', days: 3 }, limit: 20 });
});

test('a budget far above the usual price is an offer, not a question: there is no seller maximum', () => {
  assert.deepEqual(limitDecision({ seller, job: job('100', 3), nowUnix: NOW, hasWay: true }), { act: true });
  assert.deepEqual(limitDecision({ seller, job: job('100000', 3), nowUnix: NOW, hasWay: true }), { act: true });
});

test('too soon or too late asks, suggesting the nearest time the person takes', () => {
  const soon = limitDecision({ seller: { ...seller, minDeadlineDays: 4 }, job: job('30', 2), nowUnix: NOW, hasWay: true });
  assert.deepEqual(soon, { act: false, kind: 'time', suggested: { priceUsdc: '30', days: 4 }, limit: 4 });
  const late = limitDecision({ seller, job: job('30', 9), nowUnix: NOW, hasWay: true });
  assert.deepEqual(late, { act: false, kind: 'time', suggested: { priceUsdc: '30', days: 5 }, limit: 5 });
});
