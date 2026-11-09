import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendedScore, MIN_FIT, type ScoreInput } from './bargainScore.js';

/// View 73 decision 4: skill fit, price against the budget, ratings and
/// reputation weighed together; cheaper scores higher within the budget.

const base: ScoreInput = {
  topicalMatch: 80,
  locationFit: null,
  inPerson: false,
  priceUsdc: 100,
  budgetUsdc: 222,
  leewayPct: 0,
  rating: { kind: 'new', count: 0 },
  verified: false,
  completed: 0,
  disputesLost: 0,
  pastDealsTogether: 0,
};

test('cheaper ranks higher within budget at equal fit', () => {
  const cheap = blendedScore({ ...base, priceUsdc: 100 });
  const dear = blendedScore({ ...base, priceUsdc: 200 });
  assert.ok(cheap.score > dear.score);
  assert.ok(cheap.parts.price > dear.parts.price);
  assert.equal(cheap.listed, true);
});

test('a fit under 40 is never listed', () => {
  assert.equal(MIN_FIT, 40);
  assert.equal(blendedScore({ ...base, topicalMatch: 39 }).listed, false);
  assert.equal(blendedScore({ ...base, topicalMatch: 40 }).listed, true);
});

test('over the leeway is never listed, inside it scores under any in-budget price at equal fit', () => {
  assert.equal(blendedScore({ ...base, priceUsdc: 223, leewayPct: 0 }).listed, false);
  const inLeeway = blendedScore({ ...base, priceUsdc: 230, leewayPct: 10 });
  const atBudget = blendedScore({ ...base, priceUsdc: 222, leewayPct: 10 });
  assert.equal(inLeeway.listed, true);
  assert.ok(inLeeway.parts.price < atBudget.parts.price);
  assert.ok(inLeeway.parts.price >= 30 && inLeeway.parts.price < 60);
});

test('in person work counts the distance', () => {
  const near = blendedScore({ ...base, inPerson: true, locationFit: 4 });
  const far = blendedScore({ ...base, inPerson: true, locationFit: 0 });
  assert.ok(near.parts.fit > far.parts.fit);
  // Remote work ignores distance.
  assert.equal(blendedScore({ ...base, locationFit: 0 }).parts.fit, blendedScore({ ...base, locationFit: 4 }).parts.fit);
});

test('a zero budget scores the price as neutral', () => {
  const s = blendedScore({ ...base, budgetUsdc: 0 });
  assert.equal(s.parts.price, 60);
  assert.equal(s.listed, true);
  assert.ok(Number.isFinite(s.score));
});

test('an unknown fit counts as middling, not as a miss', () => {
  const s = blendedScore({ ...base, topicalMatch: null });
  assert.equal(s.parts.fit, 50);
  assert.equal(s.listed, true);
});

test('a better record raises the score, a lost dispute lowers it', () => {
  const plain = blendedScore(base).score;
  assert.ok(blendedScore({ ...base, verified: true, completed: 12 }).score > plain);
  assert.ok(blendedScore({ ...base, disputesLost: 1 }).score < plain);
  assert.ok(blendedScore({ ...base, rating: { kind: 'rated', value: 4.8, count: 9, disputed: 0 } }).score > plain);
});

test('the why names the two largest parts', () => {
  const s = blendedScore({ ...base, topicalMatch: 100, priceUsdc: 10 });
  assert.deepEqual(s.why, ['best_fit', 'fair_price']);
});

test('the clothes request orders as view 73 says', () => {
  const sellers = [
    { name: 'low', priceUsdc: 30, topicalMatch: 70 },
    { name: 'a', priceUsdc: 255, topicalMatch: 90 },
    { name: 'b', priceUsdc: 267, topicalMatch: 90 },
    { name: 'c', priceUsdc: 271, topicalMatch: 85 },
  ].map((s) => ({ name: s.name, ...blendedScore({ ...base, priceUsdc: s.priceUsdc, topicalMatch: s.topicalMatch, budgetUsdc: 222, leewayPct: 0 }) }));
  const listed = sellers.filter((s) => s.listed).sort((x, y) => y.score - x.score);
  assert.deepEqual(listed.map((s) => s.name), ['low']);
  assert.deepEqual(sellers.filter((s) => !s.listed).map((s) => s.name), ['a', 'b', 'c']);
});
