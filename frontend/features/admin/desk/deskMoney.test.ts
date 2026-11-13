import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocal } from '@/features/money/displayCurrency';
import { DESK_CURRENCIES, deskMoney, readDeskCurrency } from './deskMoney';

test('an amount reads in the chosen currency first, the exact USDC under it', () => {
  assert.deepEqual(deskMoney('52.10', 'NGN', { NGN: 1535 }), { main: '₦79,974', under: '52.10 USDC', forThem: null });
});

test('a figure kept when the money moved wins over today’s rate', () => {
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535 }, { kept: { currency: 'NGN', amount: '80000' } }).main, '₦80,000');
  assert.equal(deskMoney('52.10', 'KES', { KES: 129 }, { kept: { currency: 'NGN', amount: '80000' } }).main, formatLocal(52.1, 'KES', 129, 'en'));
});

test('a kept figure that is not a number falls back to today’s rate, never NaN', () => {
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535 }, { kept: { currency: 'NGN', amount: '633,000' } }).main, '₦79,974');
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535 }, { kept: { currency: 'NGN', amount: '' } }).main, '₦79,974');
});

test('the person’s own currency is added when it differs from the desk’s', () => {
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535, KES: 129 }, { theirs: 'KES' }).forThem, 'KES 6,721 for them');
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535, KES: 129 }, { theirs: 'NGN' }).forThem, null);
  assert.equal(deskMoney('52.10', 'NGN', { NGN: 1535 }, { theirs: 'KES' }).forThem, null);
});

test('with no rate the amount reads in USDC with a note, never a guessed figure', () => {
  assert.deepEqual(deskMoney('5', 'XOF', {}), { main: '5.00 USDC', under: 'No rate for XOF right now', forThem: null });
});

test('choosing USDC shows USDC alone', () => {
  assert.deepEqual(deskMoney('52.10', 'USDC', { NGN: 1535 }), { main: '52.10 USDC', under: null, forThem: null });
});

test('the desk currency is one of the ten, NGN when nothing or something odd is kept', () => {
  assert.deepEqual([...DESK_CURRENCIES], ['USDC', 'NGN', 'KES', 'XOF', 'USD', 'EUR', 'GBP', 'AED', 'INR', 'CNY']);
  assert.equal(readDeskCurrency(null), 'NGN');
  assert.equal(readDeskCurrency('KES'), 'KES');
  assert.equal(readDeskCurrency('BTC'), 'NGN');
});
