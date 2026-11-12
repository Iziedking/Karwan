import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTyped, currencySign, formatTyped, rateMoved, scaledLocal, typedFor, typingFilter, usdcFor } from './localAmount';

/// Amounts typed in your own currency (view 55).
///
///   npx tsx --test features/money/localAmount.test.ts

const NGN = 1346.11;

test('naira typed becomes the USDC that moves, rounded down, as the server quotes it', () => {
  assert.equal(usdcFor('50000', 'NGN', NGN), 37.144066);
  assert.equal(usdcFor('50,000', 'NGN', NGN), 37.144066);
  assert.equal(usdcFor('50000', 'NGN', null), null);
  assert.equal(usdcFor('20.5', 'USDC', null), 20.5);
  assert.equal(usdcFor('0', 'NGN', NGN), null);
});

test('each currency takes the shape it is written in', () => {
  assert.equal(cleanTyped('50000.5', 'NGN'), null);
  assert.equal(cleanTyped('49.50', 'EUR'), '49.50');
  assert.equal(typingFilter('50,000.75', 'NGN'), '50000');
  assert.equal(typingFilter('49.555', 'EUR'), '49.55');
  assert.equal(typingFilter('49,50', 'EUR'), '49.50');
  assert.equal(typingFilter('1,250', 'EUR'), '1250');
  assert.equal(typingFilter('٥٠٠', 'NGN'), '500');
  assert.equal(typingFilter('12.1234567', 'USDC'), '12.123456');
});

test('a USDC figure reads back as the person would type it; Max never more than it is worth', () => {
  assert.equal(typedFor(37.144066, 'NGN', NGN), '50000');
  assert.equal(typedFor(37.144066, 'NGN', NGN, 'down'), '49999');
  assert.equal(typedFor(20, 'NGN', NGN), '26922');
  assert.equal(typedFor(20, 'EUR', 0.92), '18.40');
  assert.equal(typedFor(20, 'USDC', null), '20');
});

test('the sign beside a field', () => {
  assert.equal(currencySign('NGN', 'en'), '₦');
  assert.equal(currencySign('USDC', 'en'), 'USDC');
});

test('a typed figure reads back as written', () => {
  assert.equal(formatTyped('50000', 'NGN', 'en'), '₦50,000');
  assert.equal(formatTyped('18.4', 'EUR', 'en'), '€18.40');
  assert.equal(formatTyped('20', 'USDC', 'en'), '20 USDC');
  assert.equal(formatTyped('', 'NGN', 'en'), '');
});

test('funding a deal agreed in naira says so when the rate has moved more than 2%', () => {
  const agreed = { currency: 'NGN', amount: '100000' };
  const usdc = 74.288133; // 100,000 at 1,346.11
  assert.equal(rateMoved(agreed, usdc, 'NGN', NGN, 'en'), null);
  assert.equal(rateMoved(agreed, usdc, 'NGN', NGN * 1.019, 'en'), null);
  const moved = rateMoved(agreed, usdc, 'NGN', 1377.07, 'en');
  assert.equal(moved?.agreed, '₦100,000');
  assert.match(moved?.now ?? '', /^₦102,30\d$/);
  assert.equal(rateMoved(agreed, usdc, 'EUR', 0.92, 'en'), null);
});

test('a prefilled field starts on the figure as it was said (view 77)', async () => {
  const { prefilled } = await import('./localAmount');
  // 37.14 USDC at 1,346.11 would read 49,994; the person said 50,000.
  assert.equal(prefilled(37.14, { currency: 'NGN', amount: '50000' }, 'NGN', 1346.11), '50000');
  assert.equal(prefilled(37.14, null, 'NGN', 1346.11), typedFor(37.14, 'NGN', 1346.11));
  assert.equal(prefilled(37.14, { currency: 'NGN', amount: '50000' }, 'USDC', null), typedFor(37.14, 'USDC', null), 'reading USDC, the said naira figure is not used');
  assert.equal(prefilled(null, { currency: 'NGN', amount: '50000' }, 'NGN', 1346.11), '');
});

test('a line worked out from a kept price keeps its proportion of the figure typed (view 77)', () => {
  const kept = { currency: 'NGN', amount: '50000' };
  assert.deepEqual(scaledLocal(kept, 37.144066, 9.2860165), { currency: 'NGN', amount: '12500' });
  assert.deepEqual(scaledLocal(kept, '37.144066', '37.886947'), { currency: 'NGN', amount: '51000' }, 'the price plus a 2% fee');
  assert.deepEqual(scaledLocal({ currency: 'EUR', amount: '18.40' }, 20, 5), { currency: 'EUR', amount: '4.6' });
  assert.equal(scaledLocal(null, 20, 5), null);
  assert.equal(scaledLocal(kept, 0, 5), null);
});
