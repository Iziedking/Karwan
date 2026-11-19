import assert from 'node:assert/strict';
import test from 'node:test';
import { ratingForWork } from './forWork.js';
import { publicRating, type DealRating } from './rules.js';

/// A rating for the work asked about: each rating weighed by how closely its
/// deal's words match the request, recent ones counting more (view 93).
///
///   npx tsx --test src/ratings/forWork.test.ts

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 19);

const r = (dealId: string, stars: DealRating['stars'], daysAgo: number): DealRating => ({
  dealId, rater: '0xbuyer', ratee: '0xseller', stars, note: null, noteHeld: false,
  settledAt: now - daysAgo * DAY, createdAt: now - daysAgo * DAY,
});

const tailorAndLogos = {
  ratings: [r('s1', 5, 0), r('s2', 5, 0), r('s3', 5, 0), r('l1', 2, 0), r('l2', 2, 0), r('l3', 2, 0)],
  terms: new Map([
    ['s1', 'Linen suit made to measure'], ['s2', 'Wedding suit'], ['s3', 'Suit alterations'],
    ['l1', 'Logo design'], ['l2', 'Brand logo'], ['l3', 'Logo refresh'],
  ]),
};

const forWorkOf = (p: ReturnType<typeof ratingForWork>) => {
  assert.equal(p.kind, 'rated');
  assert.ok(p.kind === 'rated' && p.forWork);
  return p.forWork;
};

test('suit request ranks the suit maker above their logo rating', () => {
  const suit = forWorkOf(ratingForWork(tailorAndLogos.ratings, tailorAndLogos.terms, ['suit'], now));
  assert.ok(suit.rank > 4, `suit rank ${suit.rank}`);
  assert.equal(suit.count, 3);
  const logo = forWorkOf(ratingForWork(tailorAndLogos.ratings, tailorAndLogos.terms, ['logo'], now));
  assert.ok(logo.rank < 3, `logo rank ${logo.rank}`);
});

test('a thin record stays near overall', () => {
  const ratings = [...Array.from({ length: 9 }, (_, i) => r(`l${i}`, 4, 0)), r('s1', 1, 0)];
  const terms = new Map([...ratings.map((x) => [x.dealId, 'Logo design'] as [string, string]), ['s1', 'Suit']]);
  const p = ratingForWork(ratings, terms, ['suit'], now);
  const overall = p.kind === 'rated' ? p.value : 0;
  assert.ok(Math.abs(forWorkOf(p).rank - overall) < 1);
});

test('recent counts more', () => {
  const ratings = [r('a', 5, 0), r('b', 1, 730), r('c', 3, 0)];
  const terms = new Map([['a', 'Suit'], ['b', 'Suit'], ['c', 'Catering']]);
  assert.ok(forWorkOf(ratingForWork(ratings, terms, ['suit'], now)).rank > 3.5);
});

test('no meaningful tags falls back to overall', () => {
  const ratings = [r('a', 5, 0), r('b', 1, 365), r('c', 3, 0)];
  const terms = new Map([['a', 'Suit'], ['b', 'Suit'], ['c', 'Catering']]);
  const overallR = (5 + 0.5 + 3) / 2.5;
  const fw = forWorkOf(ratingForWork(ratings, terms, ['the', 'and'], now));
  assert.ok(Math.abs(fw.rank - overallR) < 1e-9);
  assert.equal(fw.count, 0);
});

test('terms missing counts as no match', () => {
  const ratings = [r('a', 5, 0), r('b', 1, 365), r('c', 3, 0)];
  const overallR = (5 + 0.5 + 3) / 2.5;
  const fw = forWorkOf(ratingForWork(ratings, new Map(), ['suit'], now));
  assert.ok(Math.abs(fw.rank - overallR) < 1e-9);
  assert.equal(fw.count, 0);
});

test('new person gets no forWork', () => {
  const p = ratingForWork([r('a', 5, 0), r('b', 4, 0)], new Map([['a', 'Suit'], ['b', 'Suit']]), ['suit'], now);
  assert.deepEqual(p, { kind: 'new', count: 2 });
});

test('empty request gives plain publicRating', () => {
  assert.deepEqual(ratingForWork(tailorAndLogos.ratings, tailorAndLogos.terms, [], now), publicRating(tailorAndLogos.ratings));
});
