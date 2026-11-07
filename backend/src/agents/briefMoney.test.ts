import assert from 'node:assert/strict';
import test from 'node:test';
import { briefMoney } from './briefMoney.js';

const rates = { rates: { NGN: 1500 }, updatedAt: 1, source: 'coingecko' as const };

test('setup answers in the currency the person reads, at today\'s rate', () => {
  assert.deepEqual(briefMoney({ settings: { displayCurrency: 'NGN' } } as never, rates), { currency: 'NGN', rate: 1500 });
});

test('USDC, no currency, or no fresh rate reads prices as USDC', () => {
  assert.equal(briefMoney({ settings: { displayCurrency: 'USDC' } } as never, rates), null);
  assert.equal(briefMoney({ settings: {} } as never, rates), null);
  assert.equal(briefMoney(null, rates), null);
  assert.equal(briefMoney({ settings: { displayCurrency: 'KES' } } as never, rates), null);
  assert.equal(briefMoney({ settings: { displayCurrency: 'NGN' } } as never, { rates: {}, updatedAt: null, source: null }), null);
});
