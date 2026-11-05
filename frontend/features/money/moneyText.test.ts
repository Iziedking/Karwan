import assert from 'node:assert/strict';
import test from 'node:test';
import { fillMoney, localHint, moneyText } from './moneyText';

/// Prices as text (view 54): one figure in the chosen currency; USDC only
/// when USDC is chosen or there is no fresh rate.
///
///   npx tsx --test features/money/moneyText.test.ts

const NGN = 1346.11;

test('a price reads in naira only, with no USDC beside it', () => {
  assert.equal(moneyText(20, 'NGN', NGN, 'en'), '₦26,922');
  assert.equal(moneyText(0.125, 'NGN', NGN, 'en', { exact: true }), '₦168');
  assert.equal(moneyText(-5, 'NGN', NGN, 'en', { signed: true }), '-₦6,731');
  assert.doesNotMatch(moneyText(20, 'NGN', NGN, 'en'), /USDC/);
});

test('USDC chosen or no rate: USDC alone', () => {
  assert.equal(moneyText(20, 'USDC', null, 'en'), '20.00 USDC');
  assert.equal(moneyText(20, 'NGN', null, 'en'), '20.00 USDC');
});

test('Arabic reads the same figure, with Latin digits and no hidden marks', () => {
  const text = moneyText(20, 'NGN', NGN, 'ar');
  assert.doesNotMatch(text, /[⁦-⁩]|USDC/);
  assert.match(text, /26\D?922/);
});

test('each screen keeps its own USDC style when USDC is chosen', () => {
  assert.equal(moneyText(96, 'USDC', null, 'en', { compact: true }), '96 USDC');
  assert.equal(moneyText(96.5, 'NGN', NGN, 'en', { compact: true }), '₦129,900');
  assert.equal(fillMoney('{spent} of {limit}', { spent: 0.205, limit: 1 }, 'USDC', null, 'en', {}, { exact: true }), '0.205 of 1.00');
  assert.equal(fillMoney('{spent} of {limit}', { spent: 1, limit: 5 }, 'NGN', NGN, 'en'), '₦1,346 of ₦6,731');
});

test('a sentence takes the price in place of "{amount} USDC"', () => {
  assert.equal(fillMoney('Add {amount} USDC', { amount: 20 }, 'NGN', NGN, 'en'), 'Add ₦26,922');
  assert.equal(fillMoney('{amount} USDC on {network}', { amount: 20 }, 'NGN', NGN, 'en', { network: 'Base' }), '₦26,922 on Base');
  assert.equal(fillMoney('Ajouter {amount} USDC', { amount: 20 }, 'USDC', null, 'fr'), 'Ajouter 20,00 USDC');
  assert.equal(fillMoney('Spends up to {limit} USDC a week', { limit: 5 }, 'NGN', NGN, 'en'), 'Spends up to ₦6,731 a week');
  assert.equal(fillMoney('Tuma USDC {amount} kwenda {chain}', { amount: 20 }, 'NGN', NGN, 'en', { chain: 'Base' }), 'Tuma ₦26,922 kwenda Base');
  assert.equal(fillMoney('{n} checks of {missing}', { n: null }, 'NGN', NGN, 'en', { n: 3 }), '3 checks of {missing}');
});

test('a typed amount shows its local worth, or nothing', () => {
  assert.equal(localHint(20, 'NGN', NGN, 'en'), '≈ ₦26,922');
  assert.equal(localHint(20, 'USDC', null, 'en'), null);
});
