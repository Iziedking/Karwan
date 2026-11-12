import assert from 'node:assert/strict';
import test from 'node:test';
import { fillMoney, localHint, localiseFigures, moneyText } from './moneyText';

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

test('a recorded sentence says each figure in the chosen currency', () => {
  const naira = (n: number) => moneyText(n, 'NGN', NGN, 'en');
  assert.equal(localiseFigures('Received 500 USDC from @ada', naira), 'Received ₦673,055 from @ada');
  assert.equal(localiseFigures('Imepokea USDC 1,250.5 kutoka @ada', naira), `Imepokea ${naira(1250.5)} kutoka @ada`);
  assert.equal(localiseFigures('Paid 12.40 USDC and 3 USDC', naira), `Paid ${naira(12.4)} and ${naira(3)}`);
  assert.equal(localiseFigures('Money secured and protection activated', naira), 'Money secured and protection activated');
  assert.equal(localiseFigures('Received 500 USDC', (n) => moneyText(n, 'USDC', null, 'en')), 'Received 500.00 USDC');
});

test('a row\'s words say its amount as the amount beside them does (L-05)', async () => {
  const { rowLine } = await import('./moneyText');
  const naira = (n: number) => moneyText(n, 'NGN', NGN, 'en');
  assert.equal(rowLine('20 USDC arrived from Base', naira, '20', '₦26,910'), '₦26,910 arrived from Base', 'the kept figure, as on the right');
  assert.equal(rowLine('Received 20 USDC from @ada', naira, '-20', '₦26,910'), 'Received ₦26,910 from @ada', 'the sign is the amount\'s, not the words\'');
  assert.equal(rowLine('Paid 20 USDC and 3 USDC', naira, '20', '₦26,910'), `Paid ₦26,910 and ${naira(3)}`, 'another figure stays at today\'s rate');
  assert.equal(rowLine('20 USDC arrived from Base', naira, '20', null), `${naira(20)} arrived from Base`, 'nothing kept reads today\'s figure');
});

test('a payment already made reads its kept figure, or today\'s figure marked about (view 77)', async () => {
  const { paidText } = await import('./moneyText');
  assert.equal(paidText('₦50,120', '₦50,000', 'local', 'about {amount}'), '₦50,000', 'what it was worth then');
  assert.equal(paidText('₦50,120', null, 'local', 'about {amount}'), 'about ₦50,120', 'nothing was kept for it');
  assert.equal(paidText('37.14 USDC', null, 'usdc', 'about {amount}'), '37.14 USDC', 'USDC is exact');
});
