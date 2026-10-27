import assert from 'node:assert/strict';
import test from 'node:test';
import { outOfRangeKind, outOfRangeLine, rangeOf, requestFits } from './outOfRange.js';

const seller = { minBudgetUsdc: 100, maxBudgetUsdc: 500, minDeadlineDays: 2, maxDeadlineDays: 30 };
const NOW = 1_000_000;
const job = (budgetUsdc: string, days: number) => ({ budgetUsdc, deadlineUnix: NOW + days * 86_400 });

test('says which part of a request is outside the range the seller set', () => {
  assert.equal(outOfRangeKind(seller, job('80', 10), NOW), 'below-min');
  assert.equal(outOfRangeKind(seller, job('600', 10), NOW), 'above-max');
  assert.equal(outOfRangeKind(seller, job('200', 1), NOW), 'too-soon');
  assert.equal(outOfRangeKind(seller, job('200', 40), NOW), 'too-late');
  assert.equal(outOfRangeKind(seller, job('200', 10), NOW), null);
});

test('a request fits when the words overlap, without asking anything else', async () => {
  let asked = 0;
  const fits = await requestFits({
    briefTags: ['backend', 'api'],
    sellerTags: ['api', 'node'],
    sectorFits: async () => { asked += 1; return false; },
    judge: async () => { asked += 1; return { relevant: false, confidence: 0 }; },
  });
  assert.equal(fits, true);
  assert.equal(asked, 0);
});

test('with no shared words it fits on the sector, or on a confident relevance call', async () => {
  const base = { briefTags: ['shea butter'], sellerTags: ['agriculture'] };
  assert.equal(await requestFits({ ...base, sectorFits: async () => true, judge: async () => ({ relevant: false, confidence: 0 }) }), true);
  assert.equal(await requestFits({ ...base, sectorFits: async () => false, judge: async () => ({ relevant: true, confidence: 0.7 }) }), true);
  assert.equal(await requestFits({ ...base, sectorFits: async () => false, judge: async () => ({ relevant: true, confidence: 0.5 }) }), false, 'the same 0.6 bar bidding uses');
});

test('the notice says plainly what is outside the range', () => {
  assert.equal(outOfRangeLine({ outOfRange: 'below-min', budgetUsdc: '80', limit: 100, days: 10 }), 'Its budget is 80 USDC, under your 100 USDC minimum.');
  assert.equal(outOfRangeLine({ outOfRange: 'above-max', budgetUsdc: '600', limit: 500, days: 10 }), 'Its budget is 600 USDC, over your 500 USDC maximum.');
  assert.equal(outOfRangeLine({ outOfRange: 'too-soon', budgetUsdc: '200', limit: 2, days: 1 }), 'It is due in 1 day, sooner than the 2 days you need.');
  assert.equal(outOfRangeLine({ outOfRange: 'too-late', budgetUsdc: '200', limit: 30, days: 40 }), 'It is due in 40 days, later than the 30 days you take on.');
});

test('an "Ask me first" suggestion has no range; a broken one is treated the same', () => {
  assert.equal(rangeOf({ title: 'x', priceUsdc: '90' }), null);
  assert.equal(rangeOf({ outOfRange: 'nope', budgetUsdc: '80', limit: 100, days: 3 }), null);
  assert.deepEqual(rangeOf({ outOfRange: 'below-min', budgetUsdc: '80', limit: 100, days: 3 }), { outOfRange: 'below-min', budgetUsdc: '80', limit: 100, days: 3 });
});

test('a request that cannot be judged does not notify anyone', async () => {
  const never = { sectorFits: async () => true, judge: async () => ({ relevant: true, confidence: 1 }) };
  assert.equal(await requestFits({ briefTags: [], sellerTags: ['api'], ...never }), false);
  assert.equal(await requestFits({ briefTags: ['api'], sellerTags: [], ...never }), false);
});
