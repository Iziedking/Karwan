import assert from 'node:assert/strict';
import test from 'node:test';
import { budgetLocalFromQuote, cleanLocalAmount, localFromQuote, makeQuote, usdcMicrosFor, verifyQuote, QUOTE_TTL_MS } from './quote.js';
import type { UsdcRates } from './usdcRates.js';

const SECRET = 'test-secret-for-quotes';
const NOW = 1_800_000_000_000;
const RATES: UsdcRates = { rates: { NGN: 1346.11, EUR: 0.92 }, updatedAt: NOW - 30_000, source: 'coingecko' };

test('a naira amount becomes USDC at the rate, rounded down to the micro', () => {
  assert.equal(usdcMicrosFor('50000', 1346.11), 37144066n);
  const q = makeQuote('NGN', '50,000', RATES, NOW, SECRET);
  assert.ok(q);
  assert.equal(q.amount, '50000');
  assert.equal(q.usdcMicros, '37144066');
  assert.equal(q.expiresAt, NOW + QUOTE_TTL_MS);
});

test('amounts take the shape their currency allows', () => {
  assert.equal(cleanLocalAmount('50000.5', 'NGN'), null);
  assert.equal(cleanLocalAmount('49.50', 'EUR'), '49.50');
  assert.equal(cleanLocalAmount('0', 'EUR'), null);
  assert.equal(cleanLocalAmount('abc', 'NGN'), null);
});

test('no rate, no quote', () => {
  assert.equal(makeQuote('KES', '100', RATES, NOW, SECRET), null);
  assert.equal(makeQuote('NGN', '100', { rates: {}, updatedAt: null, source: null }, NOW, SECRET), null);
});

test('a quote verifies until it expires and never after a change', () => {
  const q = makeQuote('NGN', '50000', RATES, NOW, SECRET)!;
  assert.equal(verifyQuote(q.token, NOW + 60_000, SECRET)?.amount, '50000');
  assert.equal(verifyQuote(q.token, NOW + QUOTE_TTL_MS + 1, SECRET), null);
  const [body, sig] = q.token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), amount: '1' })).toString('base64url');
  assert.equal(verifyQuote(`${forged}.${sig}`, NOW, SECRET), null);
  assert.equal(verifyQuote(q.token, NOW, 'another-secret'), null);
});

test('a record keeps the local figure only when it moves the quoted USDC', () => {
  const q = makeQuote('NGN', '50000', RATES, NOW, SECRET)!;
  assert.deepEqual(localFromQuote(q.token, 37144066n, NOW, SECRET), { currency: 'NGN', amount: '50000', rate: 1346.11, at: NOW });
  assert.equal(localFromQuote(q.token, 37144067n, NOW, SECRET), undefined);
  assert.equal(localFromQuote(undefined, 37144066n, NOW, SECRET), undefined);
  assert.equal(localFromQuote('not-a-token', 37144066n, NOW, SECRET), undefined);
});

test('a request keeps the figure said when its budget is the quote rounded down to the cent', () => {
  // 300,000 naira at 1346.03 is 222.877647 USDC; the request holds 222.87.
  const rates: UsdcRates = { rates: { NGN: 1346.03 }, updatedAt: NOW - 30_000, source: 'coingecko' };
  const q = makeQuote('NGN', '300000', rates, NOW, SECRET);
  assert.ok(q);
  assert.equal(q.usdcMicros, '222877647');
  assert.deepEqual(budgetLocalFromQuote(q.token, 222.87, NOW, SECRET), { currency: 'NGN', amount: '300000', rate: 1346.03, at: NOW });
});

test('a figure that is not this budget is not kept', () => {
  const q = makeQuote('NGN', '300000', { rates: { NGN: 1346.03 }, updatedAt: NOW - 30_000, source: 'coingecko' }, NOW, SECRET);
  assert.ok(q);
  assert.equal(budgetLocalFromQuote(q.token, 222.88, NOW, SECRET), undefined);
  assert.equal(budgetLocalFromQuote(q.token, 500, NOW, SECRET), undefined);
  assert.equal(budgetLocalFromQuote(`${q.token}x`, 222.87, NOW, SECRET), undefined);
  assert.equal(budgetLocalFromQuote(undefined, 222.87, NOW, SECRET), undefined);
});

test('a quote for a card can be held longer than a typed one', () => {
  const q = makeQuote('NGN', '300000', RATES, NOW, SECRET, 30 * 60_000);
  assert.ok(q);
  assert.equal(q.expiresAt, NOW + 30 * 60_000);
  assert.ok(verifyQuote(q.token, NOW + 20 * 60_000, SECRET));
  assert.equal(verifyQuote(q.token, NOW + 31 * 60_000, SECRET), null);
});
