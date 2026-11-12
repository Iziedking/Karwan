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

test('a weekly limit said in naira is the rule: it stays the figure said as the rate moves (view 77)', async () => {
  const { limitAtRate, refreshSaidLimits, saidLimit } = await import('./agentLimit.js');
  const { newAgentRecord } = await import('./agentRecord.js');
  const at = (rate: number) => ({ rates: { NGN: rate }, updatedAt: 1, source: 'coingecko' as const });
  const said = saidLimit(1, { currency: 'NGN', amounts: { weeklyUsdc: 1500 } });
  assert.deepEqual(said, { currency: 'NGN', amount: '1500', usdc: 1 });
  assert.equal(saidLimit(1, undefined), undefined, 'said in USDC');
  const r = { ...newAgentRecord('0xabc'), weeklyBudgetUsdc: 1, weeklySaid: said };
  const moved = limitAtRate(r, at(1600));
  assert.equal(moved.weeklyBudgetUsdc, 0.9375);
  assert.deepEqual(moved.weeklySaid, { currency: 'NGN', amount: '1500', usdc: 0.9375 });
  assert.deepEqual(agentLimitView(moved, 10).weeklyLocal, { currency: 'NGN', amount: '1500' });
  assert.equal(limitAtRate(r, at(1500)), r, 'same rate, nothing to do');
  assert.equal(limitAtRate(r, at(100)).weeklyBudgetUsdc, 5, 'never past the ceiling');
  assert.equal(limitAtRate(r, { rates: {}, updatedAt: null, source: null }), r, 'no rate: keeps its last USDC');
  const tapped = limitAtRate({ ...r, weeklyBudgetUsdc: 5 }, at(1600));
  assert.equal(tapped.weeklySaid, undefined, 'a choice tapped since drops the figure');
  assert.equal(tapped.weeklyBudgetUsdc, 5);
  assert.equal(agentLimitView({ ...r, weeklyBudgetUsdc: 5 }, 10).weeklyLocal, undefined);
  const saved: string[] = [];
  const n = await refreshSaidLimits({
    list: async () => [r, { ...newAgentRecord('0xdef'), weeklyBudgetUsdc: 1 }],
    rates: async () => at(1600),
    save: async (owner, change) => { saved.push(owner); return change(r); },
  });
  assert.equal(n, 1);
  assert.deepEqual(saved, ['0xabc']);
});
