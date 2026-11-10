import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord } from './agentRecord.js';
import { mandateOf } from './mandate.js';
import { effectOf, nextBriefAt } from './mandateEffect.js';

///   npx tsx --test src/agents/mandateEffect.test.ts

// 5 Nov 2026 09:00 UTC is 10:00 in Lagos.
const NOW = Date.UTC(2026, 10, 5, 9);

const m = mandateOf(
  {
    agentWays: { sell: [{ shape: 'one_time', priceMin: 40, priceUsual: 60, daysMin: 3, daysMax: 5 }], buy: [] },
    buyer: { maxBudgetUsdc: 150, minDeadlineDays: 2, maxDeadlineDays: 10, bidCollectionSeconds: 600, milestonePcts: [100] },
  },
  { ...newAgentRecord('0xa'), weeklyBudgetUsdc: 0.5 },
  [],
);

const facts = {
  now: NOW,
  passedForPrice: [
    { jobId: 'a', budgetUsdc: 35 },
    { jobId: 'b', budgetUsdc: 30 },
    { jobId: 'c', budgetUsdc: 20 },
    { jobId: 'a', budgetUsdc: 35 },
  ],
  openRequests: [
    { jobId: 'x', budgetUsdc: 200 },
    { jobId: 'y', budgetUsdc: 100 },
    { jobId: 'z', budgetUsdc: 90 },
  ],
};

test('lowerLowestCountsRequestsItReopens', () => {
  const e = effectOf(m, { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }, facts);
  assert.equal(e.numbers.count, 2);
  assert.equal(e.line, 'Lowering your lowest to 30 USDC re-opens 2 requests you passed on this week.');
  const raise = effectOf(m, { part: 'sell-price', shape: 'one_time', lowestUsdc: 50, usualUsdc: 70 }, facts);
  assert.equal(raise.numbers.count, 0);
  assert.equal(raise.line, 'Your agent will take 50 USDC as your lowest price from now on.');
});

test('limitSaysAboutHowManyMoreChecks', () => {
  const up = effectOf(m, { part: 'weekly-limit', usdc: 1 }, facts);
  assert.equal(up.numbers.moreChecks, 100);
  assert.equal(up.line, 'Raising your weekly limit lets your agent check about 100 more records a week.');
  const same = effectOf(m, { part: 'weekly-limit', usdc: 0.502 }, facts);
  assert.equal(same.numbers.moreChecks, 0);
  assert.equal(effectOf(m, { part: 'weekly-limit', usdc: 0 }, facts).line, 'Your agent will make no paid checks.');
  assert.equal(effectOf(m, { part: 'weekly-limit', usdc: 0.25 }, facts).line, 'Your agent will stop paid checks once it has spent 0.25 USDC in a week.');
});

test('buyMostNamesOpenRequestsAboveOrBelow', () => {
  const e = effectOf(m, { part: 'buy-most', usdc: 95 }, facts);
  assert.deepEqual(e.numbers, { above: 2, below: 1 });
  assert.equal(e.line, 'New requests will spend up to 95 USDC. 2 of your open requests ask for more; their budget stays until you post them again.');
  assert.equal(effectOf(m, { part: 'buy-most', usdc: 500 }, facts).line, 'New requests will spend up to 500 USDC.');
});

test('briefSaysTheNextSend', () => {
  const later = effectOf(m, { part: 'brief', hour: 18 }, facts);
  assert.equal(later.line, 'Your next brief comes today at 18:00, Lagos time.');
  assert.equal(later.numbers.nextAt, Date.UTC(2026, 10, 5, 17));
  const early = effectOf(m, { part: 'brief', hour: 8, timeZone: 'Asia/Kolkata' }, facts);
  assert.equal(early.line, 'Your next brief comes tomorrow at 8:00, Kolkata time.');
  assert.equal(effectOf(m, { part: 'brief', on: false }, facts).line, 'Your agent will not send a daily brief.');
});

test('nextBriefAt crosses midnight in the brief zone', () => {
  // 23:30 UTC on the 5th is 00:30 on the 6th in Lagos; 8:00 Lagos on the 6th is 07:00 UTC.
  assert.equal(nextBriefAt(Date.UTC(2026, 10, 5, 23, 30), { on: true, hour: 8, timeZone: 'Africa/Lagos' }), Date.UTC(2026, 10, 6, 7));
});

test('every effect line has no empty slot in every language', () => {
  const patches = [
    { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 },
    { part: 'sell-price', shape: 'one_time', lowestUsdc: 50, usualUsdc: 70 },
    { part: 'alone', mode: 'agree' },
    { part: 'weekly-limit', usdc: 1 },
    { part: 'weekly-limit', usdc: 0 },
    { part: 'weekly-limit', usdc: 0.25 },
    { part: 'buy-most', usdc: 95 },
    { part: 'buy-most', usdc: 500 },
    { part: 'goal-add', kind: 'buy', text: 'a logo designer' },
    { part: 'goal-remove', id: 'g1' },
    { part: 'brief', hour: 18 },
    { part: 'brief', hour: 8 },
    { part: 'brief', on: false },
    { part: 'quiet', from: 22, to: 6 },
    { part: 'power', on: false },
    { part: 'power', on: true },
    { part: 'quiet-off' },
  ] as const;
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    for (const p of patches) {
      const { line } = effectOf(m, p, facts, locale);
      assert.ok(line.length > 10, `${p.part} ${locale}`);
      assert.doesNotMatch(line, /\{\w+\}|—|undefined|NaN/, `${p.part} ${locale}: ${line}`);
    }
  }
});

test('switching the agent off says what stops and what goes on; on starts from now', () => {
  const off = effectOf(m, { part: 'power', on: false }, facts).line;
  assert.match(off, /stops making offers/);
  assert.match(off, /Deals already running go on/);
  assert.match(off, /you are asked if a buyer chooses one/);
  const on = effectOf(m, { part: 'power', on: true }, facts).line;
  assert.match(on, /starts again from now/);
  assert.match(on, /does not act on what it missed/);
});
