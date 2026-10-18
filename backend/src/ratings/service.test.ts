import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealRating } from './rules.js';
import { createRatings, type RatingDeps } from './service.js';

/// Rating a settled deal from any channel: the identity rates once, whichever
/// wallet the request came from, and the answer says when it shows.
///
///   npx tsx --test src/ratings/service.test.ts

const DAY = 24 * 60 * 60 * 1000;
const SETTLED = 1_760_000_000_000;

function setup(over: Partial<RatingDeps> = {}) {
  const store: DealRating[] = [];
  const rated: string[] = [];
  const deps: RatingDeps = {
    now: () => SETTLED + DAY,
    identityOf: async (a) => (a.toLowerCase() === '0xbuyeragent' ? '0xb' : a.toLowerCase()),
    getDeal: async (id) => (id === 'd1' ? { jobId: 'd1', buyer: '0xb', seller: '0xs', settledAt: SETTLED } : id === 'open' ? { jobId: 'open', buyer: '0xb', seller: '0xs', settledAt: null } : null),
    dealsFor: async () => [
      { jobId: 'd1', buyer: '0xb', seller: '0xs', settledAt: SETTLED },
      { jobId: 'open', buyer: '0xb', seller: '0xs', settledAt: null },
    ],
    ratingsForDeal: async (id) => store.filter((r) => r.dealId === id),
    ratingsBy: async (a) => store.filter((r) => r.rater === a),
    save: async (r) => {
      if (store.some((x) => x.dealId === r.dealId && x.rater === r.rater)) return false;
      store.push(r);
      return true;
    },
    tagOf: async (a) => (a === '0xs' ? 'ada' : null),
    onRated: async (dealId) => void rated.push(dealId),
    ...over,
  };
  return { ratings: createRatings(deps), store, rated };
}

test('a rating sent as the agent address is saved for the identity, once', async () => {
  const s = setup();
  const first = await s.ratings.rateDeal('0xBuyerAgent', 'd1', 5);
  assert.equal(first.ok, true);
  assert.equal(s.store[0]!.rater, '0xb');
  assert.equal(s.store[0]!.ratee, '0xs');
  const again = await s.ratings.rateDeal('0xb', 'd1', 1);
  assert.deepEqual(again, { ok: false, message: 'You already rated this deal.' });
  assert.equal(s.store.length, 1);
});

test('after rating, the answer is just saved, and the rating shows at once', async () => {
  const s = setup();
  const r = await s.ratings.rateDeal('0xb', 'd1', 4, 'Careful work');
  assert.deepEqual(r, { ok: true, revealed: true, message: 'Saved.' });
  const both = await s.ratings.rateDeal('0xs', 'd1', 5);
  assert.deepEqual(both, { ok: true, revealed: true, message: 'Saved.' });
  assert.deepEqual(s.rated, ['d1', 'd1']);
});

test('stars outside 1 to 5, an open deal, a stranger and an unknown deal are refused plainly', async () => {
  const s = setup();
  assert.deepEqual(await s.ratings.rateDeal('0xb', 'd1', 6), { ok: false, message: 'Rate it from 1 to 5.' });
  assert.deepEqual(await s.ratings.rateDeal('0xb', 'd1', 2.5), { ok: false, message: 'Rate it from 1 to 5.' });
  assert.deepEqual(await s.ratings.rateDeal('0xb', 'open', 5), { ok: false, message: 'You can rate this deal once it settles.' });
  assert.deepEqual(await s.ratings.rateDeal('0xz', 'd1', 5), { ok: false, message: 'Only the two people in this deal can rate it.' });
  assert.deepEqual(await s.ratings.rateDeal('0xb', 'nope', 5), { ok: false, message: 'No deal with that id.' });
});

test('a note with contact details is kept private and the rater is told why', async () => {
  const s = setup();
  const r = await s.ratings.rateDeal('0xb', 'd1', 5, 'Call me on 0803 123 4567');
  assert.equal(s.store[0]!.noteHeld, true);
  assert.match(r.ok ? r.message : '', /contact details, so it stays private/);
});

test('deals waiting for your rating are the settled ones you have not rated', async () => {
  const s = setup();
  assert.deepEqual(await s.ratings.waiting('0xBuyerAgent'), [{ dealId: 'd1', withTag: 'ada', settledAt: SETTLED }]);
  await s.ratings.rateDeal('0xb', 'd1', 5);
  assert.deepEqual(await s.ratings.waiting('0xb'), []);
});

test('a disputed deal keeps its dispute beside the rating', async () => {
  const s = setup({ getDeal: async () => ({ jobId: 'd1', buyer: '0xb', seller: '0xs', settledAt: SETTLED, dispute: 'split' }) });
  await s.ratings.rateDeal('0xb', 'd1', 2);
  assert.equal(s.store[0]!.dispute, 'split');
  const plain = setup();
  await plain.ratings.rateDeal('0xb', 'd1', 5);
  assert.equal(plain.store[0]!.dispute, null);
});

test('a deal closes for ratings 14 days after it settles, and is no longer listed', async () => {
  const s = setup({ now: () => SETTLED + 14 * DAY + 1 });
  assert.deepEqual(await s.ratings.rateDeal('0xb', 'd1', 5), { ok: false, message: 'Ratings for this deal closed 14 days after it settled.' });
  assert.deepEqual(await s.ratings.waiting('0xb'), []);
});
