import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOffer, offerLapsesAt, isAboveBudget, OFFER_LIFETIME_SECONDS } from './rules.js';

const ctx = {
  budgetUsdc: '300',
  requestDeadlineUnix: 2_000_000,
  nowUnix: 1_000_000,
  sellerUser: '0xaaa',
  buyerUser: '0xbbb',
  jobOpen: true,
};
const good = { priceUsdc: '280', deliverByUnix: 1_500_000, note: 'Three routes in 48 hours.' };

test('a normal offer passes', () => {
  assert.deepEqual(checkOffer(good, ctx), { ok: true });
});

test('refuses the buyer offering on their own request, case-insensitively', () => {
  assert.deepEqual(checkOffer(good, { ...ctx, sellerUser: '0xBBB' }), { ok: false, code: 'OWN_REQUEST' });
});

test('refuses a closed request', () => {
  assert.deepEqual(checkOffer(good, { ...ctx, jobOpen: false }), { ok: false, code: 'REQUEST_CLOSED' });
});

test('price must be a positive number within 10x budget', () => {
  for (const p of ['0', '-1', 'abc', '', '1e3']) {
    assert.deepEqual(checkOffer({ ...good, priceUsdc: p }, ctx), { ok: false, code: 'BAD_PRICE' }, p);
  }
  assert.deepEqual(checkOffer({ ...good, priceUsdc: '3000' }, ctx), { ok: true });
  assert.deepEqual(checkOffer({ ...good, priceUsdc: '3000.01' }, ctx), { ok: false, code: 'PRICE_TOO_HIGH' });
  assert.deepEqual(checkOffer({ ...good, priceUsdc: '12.1234567' }, ctx), { ok: false, code: 'BAD_PRICE' });
});

test('deliver-by must be in the future and at most 30 days past the request deadline', () => {
  assert.deepEqual(checkOffer({ ...good, deliverByUnix: 1_000_000 }, ctx), { ok: false, code: 'DATE_PAST' });
  assert.deepEqual(checkOffer({ ...good, deliverByUnix: 2_000_000 + 30 * 86400 }, ctx), { ok: true });
  assert.deepEqual(checkOffer({ ...good, deliverByUnix: 2_000_000 + 30 * 86400 + 1 }, ctx), { ok: false, code: 'DATE_TOO_LATE' });
});

test('note is at most 280 characters, counted as characters not bytes', () => {
  assert.deepEqual(checkOffer({ ...good, note: 'é'.repeat(280) }, ctx), { ok: true });
  assert.deepEqual(checkOffer({ ...good, note: 'a'.repeat(281) }, ctx), { ok: false, code: 'NOTE_TOO_LONG' });
});

test('an offer lapses at 7 days or the request deadline, whichever is first', () => {
  assert.equal(offerLapsesAt(1_000_000, 5_000_000), 1_000_000 + OFFER_LIFETIME_SECONDS);
  assert.equal(offerLapsesAt(1_000_000, 1_100_000), 1_100_000);
});

test('above budget compares exact decimals', () => {
  assert.equal(isAboveBudget('300', '300'), false);
  assert.equal(isAboveBudget('300.000001', '300'), true);
});
