import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetRatingsForTest, saveRating } from '../db/ratings.js';
import { loadPublicRating, loadRatingForWork } from './publicRating.js';
import type { DealRating } from './rules.js';

/// Loading someone's rating for the work asked about (view 93).
///
///   npx tsx --test src/ratings/publicRating.test.ts

const now = Date.UTC(2026, 10, 19);
const rating = (dealId: string, rater: string, ratee: string, stars: DealRating['stars']): DealRating => ({
  dealId, rater, ratee, stars, note: null, noteHeld: false, settledAt: now, createdAt: now,
});
const terms = async () => new Map([['s1', 'Linen suit'], ['s2', 'Wedding suit'], ['s3', 'Suit alterations'], ['x1', 'Suit hire']]);

test('only ratings about the person count', async () => {
  __resetRatingsForTest();
  for (const id of ['s1', 's2', 's3']) await saveRating(rating(id, '0xbuyer', '0xtailor', 5));
  await saveRating(rating('x1', '0xtailor', '0xother', 1));
  const p = await loadRatingForWork('0xTailor', ['suit'], now, terms);
  assert.equal(p.kind, 'rated');
  assert.ok(p.kind === 'rated' && p.forWork);
  assert.equal(p.count, 3);
  assert.equal(p.forWork.count, 3);
  assert.equal(p.forWork.value, 5);
});

test('empty request equals loadPublicRating', async () => {
  __resetRatingsForTest();
  for (const id of ['s1', 's2', 's3']) await saveRating(rating(id, '0xbuyer', '0xtailor', 4));
  assert.deepEqual(await loadRatingForWork('0xtailor', [], now, terms), await loadPublicRating('0xtailor', now));
});
