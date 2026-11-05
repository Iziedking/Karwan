import assert from 'node:assert/strict';
import test from 'node:test';
import { DISPLAY_CURRENCIES, formatDisplay, formatLocal, rateLine } from './displayCurrency';

/// How amounts read when a person picks a local currency (view 51). Money
/// stays in USDC; a missing rate always falls back to USDC.
///
///   npx tsx --test features/money/displayCurrency.test.ts

test('the ten currencies, USDC first, in the owner order', () => {
  assert.deepEqual([...DISPLAY_CURRENCIES], ['USDC', 'NGN', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'AED', 'KES', 'XOF']);
});

test('usdcReadsAsIs', () => {
  assert.deepEqual(formatDisplay(4021.29, 'USDC', null, 'en'), { primary: '4,021.29', unit: 'USDC', secondary: null });
});

test('nairaLeads', () => {
  const out = formatDisplay(4021.29, 'NGN', 1346.11, 'en');
  assert.equal(out.primary, '₦5,413,099');
  assert.equal(out.unit, null);
  assert.equal(out.secondary, '4,021.29 USDC');
});

test('euro and pound keep cents', () => {
  assert.equal(formatLocal(10, 'EUR', 0.889118, 'en'), '€8.89');
  assert.equal(formatLocal(10, 'GBP', 0.741927, 'en'), '£7.42');
});

test('fallsBackToUsdcWhenStale', () => {
  assert.deepEqual(formatDisplay(12.5, 'NGN', null, 'en'), { primary: '12.50', unit: 'USDC', secondary: null });
  assert.equal(formatLocal(12.5, 'NGN', null, 'en'), null);
});

test('arabicKeepsLatinNumerals', () => {
  const out = formatDisplay(1000, 'AED', 3.67, 'ar');
  assert.match(out.primary, /3,670/);
  assert.doesNotMatch(out.primary + (out.secondary ?? ''), /[٠-٩]/);
});

test('a negative amount keeps its sign in front', () => {
  assert.equal(formatLocal(-250, 'NGN', 1346.11, 'en'), '-₦336,528');
});

test('the rate line reads 1 USDC = the local figure', () => {
  assert.equal(rateLine('NGN', 1346.11, 'en'), '1 USDC = ₦1,346');
  assert.equal(rateLine('EUR', 0.889118, 'en'), '1 USDC = €0.89');
  assert.equal(rateLine('NGN', null, 'en'), null);
});

test('recentAmountsCarryTheirSign', () => {
  assert.equal(formatLocal(500, 'NGN', 1346.11, 'en', true), '+₦673,055');
  assert.equal(formatLocal(-50, 'NGN', 1346.11, 'en', true), '-₦67,306');
  assert.equal(formatLocal(500, 'NGN', 1346.11, 'en'), '₦673,055');
});
