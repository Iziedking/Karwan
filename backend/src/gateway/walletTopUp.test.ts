import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPlan, topUpAmount } from './walletTopUp.js';

/// Send uses the whole balance (architecture view 22).
///
///   npx tsx --test src/gateway/walletTopUp.test.ts

const fees = (forwarder: string, gas = '0.002', provider = '0') => [
  { type: 'forwarder' as const, token: 'USDC', amount: forwarder },
  { type: 'gasFee' as const, token: 'USDC', amount: gas },
  { type: 'provider' as const, token: 'USDC', amount: provider },
];

test('the wallet alone covers it: send as today', () => {
  assert.deepEqual(sendPlan({ amount: 100, wallet: 109.51, pool: 50 }), { kind: 'wallet' });
  assert.deepEqual(sendPlan({ amount: 109.51, wallet: 109.51, pool: 0 }), { kind: 'wallet' });
});

test('short by some: top up the shortfall from the pool, then send', () => {
  assert.deepEqual(sendPlan({ amount: 140, wallet: 109.51, pool: 50 }), { kind: 'topUp', shortfall: 30.49 });
});

test('even both together fall short: nothing moves', () => {
  assert.deepEqual(sendPlan({ amount: 200, wallet: 109.51, pool: 50 }), { kind: 'insufficient', available: 159.51 });
});

test('the top-up adds the forwarding fee so the full shortfall lands in the wallet', () => {
  assert.deepEqual(topUpAmount(30.49, fees('0.12'), 50), { ok: true, amount: 30.61 });
});

test('the pool must also cover gas and provider fees, which come out of it', () => {
  assert.deepEqual(topUpAmount(49.9, fees('0.12', '0.002'), 50), { ok: false });
  assert.deepEqual(topUpAmount(30.49, fees('0', '0.002'), 30.492), { ok: true, amount: 30.49 });
});

test('amounts are exact to the cent and never rounded down', () => {
  assert.deepEqual(topUpAmount(0.1, fees('0.000001'), 5), { ok: true, amount: 0.11 });
});
