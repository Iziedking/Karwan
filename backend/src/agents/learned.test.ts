import assert from 'node:assert/strict';
import { test } from 'node:test';
import { learnedSuggestions, median, suggestedNoAskBelow, suggestedUsualPrice, suggestedWays, type AnsweredQuestion, type LearnedInputs } from './learned.js';

/// What the agent learns is only ever a suggestion (view 41): a way after a
/// yes to a no-way question, a usual price after three deals, a no-ask level
/// after three no answers. Nothing here writes a setting.
///
///   npx tsx --test src/agents/learned.test.ts

const q = (over: Partial<AnsweredQuestion>): AnsweredQuestion => ({ kind: 'no-way', choice: 'yes', budgetUsdc: 100, priceUsdc: 96, tradeType: 'goods', title: 'Clark shoes', ...over });

const base: LearnedInputs = {
  ways: { sell: [{ shape: 'one_time', priceMin: 20, priceUsual: 30, daysMin: 1, daysMax: 3 }] },
  noAskBelowUsdc: null,
  dismissed: [],
  answered: [],
  settled: [],
};

test('a yes to a no-way question suggests the way, once per kind, never one the person already has', () => {
  const ways = suggestedWays({ ...base, answered: [q({}), q({ title: 'Sandals' }), q({ tradeType: 'service', title: 'Logos' })] });
  assert.deepEqual(ways, [{ key: 'way:goods', kind: 'new-way', shape: 'goods', what: 'Clark shoes', priceUsdc: 96, line: 'Save this as how you sell Clark shoes?' }]);
  assert.deepEqual(suggestedWays({ ...base, answered: [q({ choice: 'no' })] }), []);
  assert.deepEqual(suggestedWays({ ...base, answered: [q({ kind: 'price-below-floor' })] }), []);
});

test('three agreed deals away from the saved usual suggest a new usual price; near it, nothing', () => {
  const settled = [{ priceUsdc: 50, tradeType: 'service' as const }, { priceUsdc: 45, tradeType: 'service' as const }, { priceUsdc: 55, tradeType: 'service' as const }];
  assert.deepEqual(suggestedUsualPrice({ ...base, settled }), [
    { key: 'usual:one_time:50', kind: 'usual-price', shape: 'one_time', priceUsdc: 50, deals: 3, line: 'You agreed 3 deals at about 50 USDC. Make it your usual price?' },
  ]);
  assert.deepEqual(suggestedUsualPrice({ ...base, settled: settled.slice(0, 2) }), [], 'two deals are not enough');
  assert.deepEqual(suggestedUsualPrice({ ...base, settled: [{ priceUsdc: 31, tradeType: 'service' }, { priceUsdc: 29, tradeType: 'service' }, { priceUsdc: 32, tradeType: 'service' }] }), [], 'within ten percent of the saved usual');
  assert.deepEqual(suggestedUsualPrice({ ...base, settled: [{ priceUsdc: 90, tradeType: 'goods' }, { priceUsdc: 90, tradeType: 'goods' }, { priceUsdc: 90, tradeType: 'goods' }] }), [], 'no goods way to change');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('three no answers under a level suggest a no-ask level, unless one at least as high is set', () => {
  const nos = [q({ kind: 'price-below-floor', choice: 'no', budgetUsdc: 60, priceUsdc: null }), q({ kind: 'counter-below-floor', choice: 'no', budgetUsdc: 100, priceUsdc: 70 }), q({ kind: 'price-below-floor', choice: 'no', budgetUsdc: 55, priceUsdc: null })];
  assert.deepEqual(suggestedNoAskBelow({ ...base, answered: nos }), [{ key: 'noask:70', kind: 'no-ask-below', priceUsdc: 70, line: 'You said no to offers under 70 USDC three times. Stop asking you below that?' }]);
  assert.deepEqual(suggestedNoAskBelow({ ...base, answered: nos.slice(0, 2) }), []);
  assert.deepEqual(suggestedNoAskBelow({ ...base, noAskBelowUsdc: 70, answered: nos }), []);
  assert.deepEqual(suggestedNoAskBelow({ ...base, answered: nos.map((n) => ({ ...n, choice: 'yes' as const })) }), []);
});

test('a dismissed suggestion stays away, and the inputs are never changed', () => {
  const input: LearnedInputs = { ...base, dismissed: ['way:goods'], answered: [q({})] };
  const before = JSON.stringify(input);
  assert.deepEqual(learnedSuggestions(input), []);
  assert.deepEqual(learnedSuggestions({ ...input, dismissed: [] }).map((s) => s.key), ['way:goods']);
  assert.equal(JSON.stringify(input), before);
});
