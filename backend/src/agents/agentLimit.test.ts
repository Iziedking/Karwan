import assert from 'node:assert/strict';
import test from 'node:test';
import { agentLimitSchema, agentLimitView } from './agentLimit.js';
import type { AgentRecord } from './agentRecord.js';

/// What Money's Agents tab shows (view 51, third round): what the agent may
/// spend this week, what it spent and what is left.
///
///   npx tsx --test src/agents/agentLimit.test.ts

const NOW = Date.UTC(2026, 10, 5, 12);
const DAY = 86_400_000;

const record: AgentRecord = {
  owner: '0xabc',
  weeklyBudgetUsdc: 1,
  weeklyReport: true,
  spend: [
    { at: NOW - DAY, usd: 0.005, kind: 'record' },
    { at: NOW - 2 * DAY, usd: 0.1, kind: 'research' },
    { at: NOW - 3 * DAY, usd: 0.005, kind: 'record' },
    { at: NOW - 9 * DAY, usd: 0.5, kind: 'research' },
  ],
};

test('limitShowsSpentAndLeftThisWeek', () => {
  assert.deepEqual(agentLimitView(record, NOW), {
    weeklyUsdc: 1,
    spentUsdc: 0.11,
    leftUsdc: 0.89,
    recordChecks: 2,
    webSearches: 1,
    maxUsdc: 5,
    choices: [0.5, 1, 5],
  });
});

test('leftNeverGoesBelowZero', () => {
  const over = { ...record, weeklyBudgetUsdc: 0.05 };
  assert.equal(agentLimitView(over, NOW).leftUsdc, 0);
});

test('aLimitOutsideTheChoicesIsListedToo', () => {
  assert.deepEqual(agentLimitView({ ...record, weeklyBudgetUsdc: 0.25 }, NOW).choices, [0.25, 0.5, 1, 5]);
});

test('theLimitSavesFromZeroToFive', () => {
  assert.equal(agentLimitSchema.parse({ weeklyUsdc: 0 }).weeklyUsdc, 0);
  assert.equal(agentLimitSchema.parse({ weeklyUsdc: 5 }).weeklyUsdc, 5);
  assert.equal(agentLimitSchema.safeParse({ weeklyUsdc: 5.01 }).success, false);
  assert.equal(agentLimitSchema.safeParse({ weeklyUsdc: -1 }).success, false);
  assert.equal(agentLimitSchema.safeParse({ weeklyUsdc: '1' }).success, false);
});
