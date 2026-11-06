import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTyped, currencySign, formatTyped, rateMoved, typedFor, typingFilter, usdcFor } from './localAmount';

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
