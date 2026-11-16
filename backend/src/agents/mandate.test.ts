import assert from 'node:assert/strict';
import test from 'node:test';
import { newAgentRecord } from './agentRecord.js';
import { DEFAULT_BRIEF, DEFAULT_QUIET, MAX_GOALS, mandateOf, mandatePatchSchema, previewPatch, sayMandate, validatePatch, type Mandate } from './mandate.js';
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
  assert.deepEqual(m.switches, { offers: true, bargain: true, agree: false, lock: false, find: true, data: true, brief: true });
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
    'Alone it may: find people, send the morning brief. Switched off: make offers, bargain, agree a price, lock money, pay for checks and research.',
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

test('the agent is on unless the person switched it off, and off is said first', () => {
  assert.equal(base().on, true);
  const off = mandateOf({ ...profile, agentPrefs: { agentMode: 'ask' as const, agentOn: false } }, null, []);
  assert.equal(off.on, false);
  assert.equal(validatePatch(base(), { part: 'power', on: false }), null);
  assert.equal(validatePatch(off, { part: 'power', on: true }), null);
  assert.equal(previewPatch(base(), { part: 'power', on: false }, NOW).on, false);
  assert.equal(previewPatch(off, { part: 'power', on: true }, NOW).on, true);
  assert.equal(mandatePatchSchema.safeParse({ part: 'power', on: false }).success, true);
  assert.equal(mandatePatchSchema.safeParse({ part: 'power' }).success, false);
  const en = sayMandate(off, 'en');
  assert.equal(en[0], 'Your agent is off. It does nothing for you until you turn it back on.');
  assert.equal(sayMandate(base(), 'en').some((l) => l.includes('is off. It does nothing')), false);
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    const first = sayMandate(off, locale)[0]!;
    assert.notEqual(first, en[0], locale);
    assert.doesNotMatch(first, /\{\w+\}|—|undefined/, locale);
  }
});

/// View 87, step 2: each switch, the lock limits and turning back on.

const agreeing = (): Mandate => mandateOf({ ...profile, agentPrefs: { agentMode: 'agree' as const } }, newAgentRecord('0xA'), []);
const RULES = { perDeal: { usdc: 30 }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' as const };

test('a switch changes only itself in the preview', () => {
  const m = base();
  for (const name of ['offers', 'bargain', 'agree', 'find', 'data', 'brief'] as const) {
    for (const on of [true, false]) {
      const after = previewPatch(m, { part: 'switch', name, on }, NOW);
      const expected = { ...m.switches, [name]: on };
      if (!expected.agree) expected.lock = false;
      assert.deepEqual(after.switches, expected, `${name} ${on}`);
      assert.equal(validatePatch(m, { part: 'switch', name, on }), null);
    }
  }
  assert.equal(previewPatch(m, { part: 'switch', name: 'brief', on: false }, NOW).brief.on, false);
  assert.equal(previewPatch(m, { part: 'switch', name: 'offers', on: true }, NOW).alone, 'offers');
  assert.equal(mandatePatchSchema.safeParse({ part: 'switch', name: 'everything', on: true }).success, false);
});

test('turning Agree a price off turns Lock money off in the preview', () => {
  const m = { ...agreeing(), lock: RULES };
  m.switches = { ...m.switches, lock: true };
  assert.equal(previewPatch(m, { part: 'switch', name: 'agree', on: false }, NOW).switches.lock, false);
});

test('Lock money needs Agree a price on', () => {
  const m = { ...base(), lock: RULES };
  assert.match(validatePatch(m, { part: 'switch', name: 'lock', on: true })!, /Agree a price first/);
  assert.match(validatePatch(m, { part: 'lock-rules', on: true, perDealUsdc: 30, perWeekUsdc: 90 })!, /Agree a price first/);
  assert.equal(validatePatch(m, { part: 'switch', name: 'lock', on: false }), null);
});

test('Lock money needs its limits before it is turned on', () => {
  const m = agreeing();
  assert.match(validatePatch(m, { part: 'switch', name: 'lock', on: true })!, /one deal and in a week first/);
  const patch = { part: 'lock-rules' as const, on: true as const, perDealUsdc: 30, perWeekUsdc: 90 };
  assert.equal(validatePatch(m, patch), null);
  const after = previewPatch(m, patch, NOW);
  assert.deepEqual(after.lock, RULES);
  assert.equal(after.switches.lock, true);
  assert.equal(validatePatch({ ...m, lock: RULES }, { part: 'switch', name: 'lock', on: true }), null);
});

test('lock limits outside their bounds are refused', () => {
  const m = agreeing();
  const refused = (p: Record<string, unknown>) => assert.ok(validatePatch(m, { part: 'lock-rules', ...p } as never), JSON.stringify(p));
  refused({ perDealUsdc: 100, perWeekUsdc: 90 });
  refused({ perDealUsdc: 0, perWeekUsdc: 90 });
  refused({ perDealUsdc: 30, perWeekUsdc: 1_000_001 });
  refused({ perDealUsdc: 30 });
  refused({ perDealUsdc: 30, perWeekUsdc: 90, perDay: 0 });
  refused({ perDealUsdc: 30, perWeekUsdc: 90, perDay: 11 });
  assert.equal(mandatePatchSchema.safeParse({ part: 'lock-rules', who: 'friends' }).success, false);
  assert.equal(validatePatch({ ...m, lock: RULES }, { part: 'lock-rules', perDay: 5 }), null, 'one figure at a time once the limits exist');
  assert.equal(validatePatch({ ...m, lock: RULES }, { part: 'lock-rules', perDealUsdc: 91 }) === null, false);
});

test('a limit typed in the person\'s own currency is kept as typed', () => {
  const after = previewPatch(agreeing(), { part: 'lock-rules', perDealUsdc: 31.25, perWeekUsdc: 93.75, said: { currency: 'NGN', amounts: { perDealUsdc: 50000, perWeekUsdc: 150000 } } }, NOW);
  assert.deepEqual(after.lock!.perDeal, { usdc: 31.25, said: { currency: 'NGN', amount: '50000' } });
  assert.deepEqual(after.lock!.perWeek, { usdc: 93.75, said: { currency: 'NGN', amount: '150000' } });
});

test('turning back on is only for an agent that stopped itself', () => {
  assert.match(validatePatch(base(), { part: 'resume' })!, /has not stopped/);
  const record = { ...newAgentRecord('0xA'), stopped: { at: NOW, reason: 'locks-today' as const }, lock: { ...RULES, locks: [] } };
  const stopped = mandateOf({ ...profile, agentPrefs: { agentMode: 'agree' as const, alone: { lock: true } } }, record, []);
  assert.deepEqual(stopped.stopped, { at: NOW, reason: 'locks-today' });
  assert.equal(validatePatch(stopped, { part: 'resume' }), null);
  const after = previewPatch(stopped, { part: 'resume' }, NOW);
  assert.equal(after.stopped, null);
  assert.equal(after.switches.lock, false);
});

test('the mandate says the switches, the lock limits and why it stopped', () => {
  const record = { ...newAgentRecord('0xA'), lock: { perDeal: { usdc: 31.25, said: { currency: 'NGN' as const, amount: '50000' } }, perWeek: { usdc: 90 }, perDay: 3, who: 'record' as const, locks: [] } };
  const m = mandateOf({ ...profile, agentPrefs: { agentMode: 'agree' as const, alone: { lock: true } } }, record, []);
  const en = sayMandate(m, 'en');
  assert.ok(en.includes('Alone it may: make offers, bargain, agree a price, lock money, find people, pay for checks and research, send the morning brief.'));
  assert.ok(en.includes('Lock money: at most 50,000 NGN a deal and 90 USDC a week, only with people who have a record, 3 a day.'));
  assert.equal(sayMandate({ ...m, switches: { ...m.switches, lock: false } }, 'en').some((l) => l.startsWith('Lock money:')), false);
  for (const reason of ['locks-today', 'lock-failures', 'not-family'] as const) {
    for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
      const lines = sayMandate({ ...m, stopped: { at: NOW, reason } }, locale);
      assert.doesNotMatch(lines.join(' '), /\{\w+\}|—|undefined|NaN/, `${locale} ${reason}`);
      if (locale !== 'en') assert.notEqual(lines[0], sayMandate({ ...m, stopped: { at: NOW, reason } }, 'en')[0], `${locale} ${reason}`);
    }
  }
  assert.equal(sayMandate({ ...m, stopped: { at: NOW, reason: 'locks-today' } }, 'en')[0], 'Your agent stopped. It locked money 3 times today, the most you allow in a day.');
});
