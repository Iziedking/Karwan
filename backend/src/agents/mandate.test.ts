import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord } from './agentRecord.js';
import { DEFAULT_BRIEF, DEFAULT_QUIET, MAX_GOALS, mandateOf, sayMandate, validatePatch, type Mandate } from './mandate.js';
import type { MarketWatch } from '../intelligence/watches.js';

///   npx tsx --test src/agents/mandate.test.ts

const NOW = Date.UTC(2026, 10, 5, 9);

const profile = {
  agentWays: {
    sell: [
      { shape: 'one_time' as const, priceMin: 40, priceUsual: 60, daysMin: 3, daysMax: 5 },
      { shape: 'goods' as const, what: 'rice', priceMin: 30, priceUsual: 35, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 4 },
    ],
    buy: [{ shape: 'one_time' as const, maxPrice: 200, needDays: 10 }],
  },
  buyer: { maxBudgetUsdc: 150, minDeadlineDays: 2, maxDeadlineDays: 10, bidCollectionSeconds: 600, milestonePcts: [50, 50] },
  agentPrefs: { agentMode: 'ask' as const },
};

const watch: MarketWatch = { id: 'w1', owner: '0xa', kind: 'requests', category: 'design' as MarketWatch['category'], createdAt: NOW, expiresAt: NOW + 1, lastCheckedAt: NOW };

function base(): Mandate {
  const record = { ...newAgentRecord('0xA'), weeklyBudgetUsdc: 1 };
  return mandateOf(profile, record, [watch]);
}

test('readsEachPartFromItsStore', () => {
  const record = {
    ...newAgentRecord('0xA'),
    weeklyBudgetUsdc: 1,
    goals: [{ id: 'g1', kind: 'buy' as const, text: 'a logo designer', createdAt: NOW }],
    brief: { on: false, hour: 7, timeZone: 'Europe/Paris' },
    quiet: null,
  };
  const m = mandateOf(profile, record, [watch]);
  assert.deepEqual(m.sell[0], { shape: 'one_time', lowestUsdc: 40, usualUsdc: 60, days: [3, 5] });
  assert.deepEqual(m.sell[1], { shape: 'goods', what: 'rice', lowestUsdc: 30, usualUsdc: 35, days: [2, 4] });
  assert.deepEqual(m.buy, { mostUsdc: 150, days: [2, 10], split: [50, 50] });
  assert.equal(m.alone, 'ask');
  assert.equal(m.weeklyLimitUsdc, 1);
  assert.deepEqual(m.watches, [{ id: 'w1', kind: 'requests', category: 'design' }]);
  assert.equal(m.goals[0]!.text, 'a logo designer');
  assert.deepEqual(m.brief, { on: false, hour: 7, timeZone: 'Europe/Paris' });
  assert.equal(m.quiet, null);
});

test('defaultsBriefAndQuiet', () => {
  const m = mandateOf({}, null, []);
  assert.deepEqual(m.brief, DEFAULT_BRIEF);
  assert.deepEqual(m.quiet, DEFAULT_QUIET);
  assert.deepEqual(m.goals, []);
  assert.equal(m.alone, 'offers');
  assert.equal(m.weeklyLimitUsdc, 0.25);
  assert.deepEqual(m.sell, []);
  assert.deepEqual(m.buy, { mostUsdc: null, days: null, split: null });
});

test('oldSellerProfileStillReads', () => {
  const m = mandateOf({ seller: { skills: ['logo'], bio: '', minBudgetUsdc: 20, maxBudgetUsdc: 60, minDeadlineDays: 2, maxDeadlineDays: 6, usualSet: true } }, null, []);
  assert.deepEqual(m.sell, [{ shape: 'one_time', lowestUsdc: 20, usualUsdc: 60, days: [2, 6] }]);
});

test('buying limit falls back to the saved buying way', () => {
  const m = mandateOf({ agentWays: profile.agentWays }, null, []);
  assert.equal(m.buy.mostUsdc, 200);
});

test('refusesSixthGoal', () => {
  const m = base();
  m.goals = Array.from({ length: MAX_GOALS }, (_, i) => ({ id: `g${i}`, kind: 'buy' as const, text: `goal ${i}`, createdAt: NOW }));
  assert.match(validatePatch(m, { part: 'goal-add', kind: 'sell', text: 'sell 20 bags of rice' })!, /five goals/);
  m.goals.pop();
  assert.equal(validatePatch(m, { part: 'goal-add', kind: 'sell', text: 'sell 20 bags of rice' }), null);
  assert.ok(validatePatch(m, { part: 'goal-add', kind: 'sell', text: ' ' }));
  assert.ok(validatePatch(m, { part: 'goal-remove', id: 'nope' }));
});

test('refusesBadTimeZone', () => {
  const m = base();
  assert.ok(validatePatch(m, { part: 'brief', timeZone: 'Mars/Olympus' }));
  assert.equal(validatePatch(m, { part: 'brief', timeZone: 'Africa/Nairobi' }), null);
  assert.ok(validatePatch(m, { part: 'brief', hour: 24 }));
  assert.ok(validatePatch(m, { part: 'quiet', from: 7, to: 7 }));
  assert.equal(validatePatch(m, { part: 'quiet', from: 22, to: 6 }), null);
});

test('refusesLimitOutsideZeroToFive', () => {
  const m = base();
  assert.ok(validatePatch(m, { part: 'weekly-limit', usdc: -1 }));
  assert.ok(validatePatch(m, { part: 'weekly-limit', usdc: 5.01 }));
  assert.equal(validatePatch(m, { part: 'weekly-limit', usdc: 0 }), null);
  assert.equal(validatePatch(m, { part: 'weekly-limit', usdc: 5 }), null);
  assert.ok(validatePatch(m, { part: 'buy-most', usdc: 0 }));
});

test('refusesLowestAboveUsual', () => {
  const m = base();
  assert.match(validatePatch(m, { part: 'sell-price', shape: 'one_time', lowestUsdc: 70 })!, /usual/);
  assert.equal(validatePatch(m, { part: 'sell-price', shape: 'one_time', lowestUsdc: 70, usualUsdc: 80 }), null);
  assert.equal(validatePatch(m, { part: 'sell-price', shape: 'one_time', lowestUsdc: 30 }), null);
  assert.ok(validatePatch(m, { part: 'sell-price', shape: 'hourly', lowestUsdc: 10 }));
});

test('sayMandateLinesInFiveLanguages', () => {
  const m = base();
  m.goals = [{ id: 'g1', kind: 'buy', text: 'a logo designer', createdAt: NOW }];
  const en = sayMandate(m, 'en');
  assert.deepEqual(en, [
    'Your agent sells work from 40 USDC (usually 60), in 3 to 5 days.',
    'Your agent sells rice from 30 USDC (usually 35).',
    'When you buy, it spends up to 150 USDC a request.',
    'It asks you about every fitting request first.',
    'It may spend up to 1 USDC a week on record checks and research.',
    'It watches 1 market for you.',
    'Your goals: a logo designer.',
    'Your brief comes at 8:00, Lagos time.',
    'Quiet hours: 21:00 to 7:00.',
  ]);
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    const lines = sayMandate(m, locale);
    assert.equal(lines.length, en.length, locale);
    lines.forEach((line, i) => {
      assert.doesNotMatch(line, /\{\w+\}|—|undefined|NaN/, `${locale}: ${line}`);
      assert.notEqual(line, en[i], `${locale} line ${i} fell back to English`);
    });
  }
  const off = sayMandate({ ...mandateOf({}, null, []), brief: { ...DEFAULT_BRIEF, on: false }, quiet: null }, 'en');
  assert.ok(off.includes('Your agent is not selling anything yet.'));
  assert.ok(off.includes('Your daily brief is off.'));
  assert.ok(off.includes('Quiet hours are off.'));
});
