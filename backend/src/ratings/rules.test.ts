import assert from 'node:assert/strict';
import test from 'node:test';
import { holdNote, isRevealed, mayRate, publicRating, ratingLine, revealedAbout, type DealRating } from './rules.js';

/// Who may rate a settled deal, when ratings show, and the public number.
///
///   npx tsx --test src/ratings/rules.test.ts

const DAY = 24 * 60 * 60 * 1000;
const SETTLED = 1_760_000_000_000;
const deal = { buyer: '0xB', seller: '0xs', settledAt: SETTLED };

const rating = (rater: string, ratee: string, stars: DealRating['stars'], over: Partial<DealRating> = {}): DealRating => ({
  dealId: 'd1', rater, ratee, stars, note: null, noteHeld: false, settledAt: SETTLED, createdAt: SETTLED + 1, ...over,
});

test('only the two parties may rate', () => {
  assert.deepEqual(mayRate(deal, '0xb', []), { ok: true, ratee: '0xs' });
  assert.deepEqual(mayRate(deal, '0xS', []), { ok: true, ratee: '0xb' });
  assert.deepEqual(mayRate(deal, '0xother', []), { ok: false, reason: 'not_party' });
});

test('a deal that has not settled cannot be rated', () => {
  assert.deepEqual(mayRate({ ...deal, settledAt: null }, '0xb', []), { ok: false, reason: 'not_settled' });
});

test('one rating per side', () => {
  const first = [rating('0xb', '0xs', 5)];
  assert.deepEqual(mayRate(deal, '0xb', first), { ok: false, reason: 'already_rated' });
  assert.deepEqual(mayRate(deal, '0xs', first), { ok: true, ratee: '0xb' });
});

test('a rating shows as soon as it is given', () => {
  const one = [rating('0xb', '0xs', 5)];
  assert.equal(isRevealed(one, SETTLED, SETTLED + DAY), true);
  assert.equal(isRevealed([...one, rating('0xs', '0xb', 4)], SETTLED, SETTLED + DAY), true);
  assert.equal(isRevealed([], SETTLED, SETTLED + DAY), false);
});

test('fewer than three ratings shows New, not a number', () => {
  assert.deepEqual(publicRating([rating('a', 'x', 5), rating('b', 'x', 5)]), { kind: 'new', count: 2 });
  assert.deepEqual(publicRating([]), { kind: 'new', count: 0 });
});

test('the rating is the mean to one decimal: 5,4,4 → 4.3', () => {
  assert.deepEqual(publicRating([rating('a', 'x', 5), rating('b', 'x', 4), rating('c', 'x', 4)]), { kind: 'rated', value: 4.3, count: 3, disputed: 0 });
});

test('ratings from disputed deals are counted beside the number', () => {
  const r = publicRating([rating('a', 'x', 1, { dispute: 'buyer' }), rating('b', 'x', 5), rating('c', 'x', 5, { dispute: 'split' })]);
  assert.deepEqual(r, { kind: 'rated', value: 3.7, count: 3, disputed: 2 });
  assert.equal(ratingLine(r), '3.7 from 3 deals, 2 disputed');
  assert.equal(ratingLine({ kind: 'rated', value: 4.8, count: 23, disputed: 0 }), '4.8 from 23 deals');
});

test('a note with a phone number or link is held', () => {
  assert.equal(holdNote('Call me on +234 803 123 4567'), true);
  assert.equal(holdNote('See https://example.com/me'), true);
  assert.equal(holdNote('mail ada@example.com'), true);
  assert.equal(holdNote('Fast, careful work. Would buy again.'), false);
});

test('the record shows every rating given', () => {
  const blind = rating('0xb', '0xs', 1, { dealId: 'd1' });
  const both = [rating('0xc', '0xs', 5, { dealId: 'd2' }), rating('0xs', '0xc', 4, { dealId: 'd2' })];
  const old = rating('0xd', '0xs', 3, { dealId: 'd3', settledAt: SETTLED - 20 * DAY });
  const byDeal = new Map([['d1', [blind]], ['d2', both], ['d3', [old]]]);
  const shown = revealedAbout([blind, both[0]!, old], byDeal, SETTLED + DAY);
  assert.deepEqual(shown.map((r) => r.dealId).sort(), ['d1', 'd2', 'd3']);
});
