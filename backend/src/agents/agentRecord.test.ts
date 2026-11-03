import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WEEKLY_BUDGET_USDC, addSpend, budgetNoticeDue, canSpend, newAgentRecord, spentThisWeek, weeklyLineDue } from './agentRecord.js';

/// The person's agent record (view 48, step 6): a weekly data budget of 0.25
/// USDC by default, what the agents spent, and the weekly line.

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

test('a new record has the owner budget and the weekly line on', () => {
  const r = newAgentRecord('0xA');
  assert.equal(r.owner, '0xa');
  assert.equal(r.weeklyBudgetUsdc, DEFAULT_WEEKLY_BUDGET_USDC);
  assert.equal(DEFAULT_WEEKLY_BUDGET_USDC, 0.25);
  assert.equal(r.weeklyReport, true);
});

test('spend counts the last 7 days only, and old entries are dropped as new ones come in', () => {
  let r = newAgentRecord('0xa');
  r = addSpend(r, 0.1, 'research', NOW - 8 * DAY);
  r = addSpend(r, 0.005, 'record', NOW - DAY);
  r = addSpend(r, 0.021, 'research', NOW);
  assert.equal(spentThisWeek(r, NOW), 0.026);
  assert.equal(r.spend.length, 2, 'the 8-day-old payment is dropped');
});

test('a payment fits when it stays inside the budget', () => {
  let r = newAgentRecord('0xa');
  r = addSpend(r, 0.24, 'research', NOW);
  assert.equal(canSpend(r, 0.005, NOW), true);
  assert.equal(canSpend(r, 0.021, NOW), false);
  assert.equal(canSpend({ ...r, weeklyBudgetUsdc: 0 }, 0.005, NOW), false, 'a budget of 0 pays for nothing');
});

test('the weekly line is due once a week when something was spent, with what it paid for', () => {
  let r = newAgentRecord('0xa');
  assert.equal(weeklyLineDue(r, NOW), null, 'nothing spent, nothing to say');
  r = addSpend(r, 0.005, 'record', NOW - DAY);
  r = addSpend(r, 0.005, 'record', NOW - DAY);
  r = addSpend(r, 0.021, 'research', NOW - DAY);
  assert.deepEqual(weeklyLineDue(r, NOW), { totalUsdc: 0.031, recordChecks: 2, webSearches: 1 });
  assert.equal(weeklyLineDue({ ...r, lastWeeklyAt: NOW - 2 * DAY }, NOW), null, 'sent two days ago');
  assert.equal(weeklyLineDue({ ...r, weeklyReport: false }, NOW), null, 'switched off');
});

test('the budget notice goes out at most once in 7 days', () => {
  const r = newAgentRecord('0xa');
  assert.equal(budgetNoticeDue(r, NOW), true);
  assert.equal(budgetNoticeDue({ ...r, lastBudgetNoticeAt: NOW - 3 * DAY }, NOW), false);
  assert.equal(budgetNoticeDue({ ...r, lastBudgetNoticeAt: NOW - 8 * DAY }, NOW), true);
});
