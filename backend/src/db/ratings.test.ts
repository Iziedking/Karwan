import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealRating } from '../ratings/rules.js';
import { __resetRatingsForTest, ratingsAbout, ratingsForDeal, saveRating, scrubNotesBy } from './ratings.js';

/// The ratings store: one rating per side of a deal, read by deal or by the
/// person rated. In memory here; Postgres in production.
///
///   npx tsx --test src/db/ratings.test.ts

const r = (dealId: string, rater: string, ratee: string, stars: DealRating['stars']): DealRating => ({
  dealId, rater, ratee, stars, note: null, noteHeld: false, settledAt: 1, createdAt: 2,
});

test('a rating is saved once per side and read back by deal and by person', async () => {
  __resetRatingsForTest();
  assert.equal(await saveRating(r('d1', '0xB', '0xs', 5)), true);
  assert.equal(await saveRating(r('d1', '0xb', '0xs', 1)), false);
  assert.equal(await saveRating(r('d1', '0xs', '0xb', 4)), true);
  assert.equal(await saveRating(r('d2', '0xc', '0xs', 3)), true);
  assert.deepEqual((await ratingsForDeal('d1')).map((x) => x.stars).sort(), [4, 5]);
  assert.deepEqual((await ratingsAbout('0xS')).map((x) => x.dealId).sort(), ['d1', 'd2']);
  assert.equal((await ratingsForDeal('d1')).find((x) => x.rater === '0xb')?.stars, 5);
});

test('deleting an account keeps the stars it gave but drops its notes', async () => {
  __resetRatingsForTest();
  await saveRating({ ...r('d9', '0xgone', '0xs', 2), note: 'Slow and rude', noteHeld: false });
  await scrubNotesBy('0xGONE');
  const [kept] = await ratingsForDeal('d9');
  assert.equal(kept!.stars, 2);
  assert.equal(kept!.note, null);
});
