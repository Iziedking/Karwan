import assert from 'node:assert/strict';
import test from 'node:test';
import { fillMoney, localHint, moneyText } from './moneyText';

/// Prices as text: the chosen currency leads, the USDC follows.
///
///   npx tsx --test features/money/moneyText.test.ts

const NGN = 1346.11;

test('a price leads in naira with the USDC beside it', () => {
  assert.equal(moneyText(20, 'NGN', NGN, 'en'), '₦26,922 · 20.00 USDC');
  assert.equal(moneyText(0.125, 'NGN', NGN, 'en', { exact: true }), '₦168 · 0.125 USDC');
  assert.equal(moneyText(-5, 'NGN', NGN, 'en', { signed: true }), '-₦6,731 · −5.00 USDC');
});

test('USDC chosen or no rate: USDC alone', () => {
  assert.equal(moneyText(20, 'USDC', null, 'en'), '20.00 USDC');
  assert.equal(moneyText(20, 'NGN', null, 'en'), '20.00 USDC');
});

test('Arabic reads the same figures, with Latin digits and no hidden marks', () => {
  const text = moneyText(20, 'NGN', NGN, 'ar');
  assert.doesNotMatch(text, /[⁦-⁩]/);
  assert.match(text, /26\D?922/);
  assert.match(text, / · 20\.00 USDC$/);
});

test('each screen keeps its own USDC style', () => {
  assert.equal(moneyText(96, 'USDC', null, 'en', { compact: true }), '96 USDC');
  assert.equal(moneyText(96.5, 'NGN', NGN, 'en', { compact: true }), '₦129,900 · 96.5 USDC');
  assert.equal(fillMoney('{spent} of {limit}', { spent: 0.205, limit: 1 }, 'USDC', null, 'en', {}, { exact: true }), '0.205 of 1.00');
  assert.equal(fillMoney('{spent} of {limit}', { spent: 1, limit: 5 }, 'NGN', NGN, 'en'), '₦1,346 · 1.00 USDC of ₦6,731 · 5.00 USDC');
});

test('a sentence takes the price in place of "{amount} USDC"', () => {
  assert.equal(fillMoney('Add {amount} USDC', { amount: 20 }, 'NGN', NGN, 'en'), 'Add ₦26,922 · 20.00 USDC');
  assert.equal(fillMoney('{amount} USDC on {network}', { amount: 20 }, 'NGN', NGN, 'en', { network: 'Base' }), '₦26,922 · 20.00 USDC on Base');
  assert.equal(fillMoney('Ajouter {amount} USDC', { amount: 20 }, 'USDC', null, 'fr'), 'Ajouter 20,00 USDC');
  assert.equal(fillMoney('Spends up to {limit} USDC a week', { limit: 5 }, 'NGN', NGN, 'en'), 'Spends up to ₦6,731 · 5.00 USDC a week');
  assert.equal(fillMoney('Tuma USDC {amount} kwenda {chain}', { amount: 20 }, 'NGN', NGN, 'en', { chain: 'Base' }), 'Tuma ₦26,922 · 20.00 USDC kwenda Base');
  assert.equal(fillMoney('{n} checks of {missing}', { n: null }, 'NGN', NGN, 'en', { n: 3 }), '3 checks of {missing}');
});

test('a typed amount shows its local worth, or nothing', () => {
  assert.equal(localHint(20, 'NGN', NGN, 'en'), '≈ ₦26,922');
  assert.equal(localHint(20, 'USDC', null, 'en'), null);
});
