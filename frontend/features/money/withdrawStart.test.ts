import assert from 'node:assert/strict';
import test from 'node:test';
import { withdrawReady } from './withdrawStart';

/// Withdraw starts with how much and where (view 44, P8).
///
///   npx tsx --test features/money/withdrawStart.test.ts

const A = '0x' + 'ab'.repeat(20);

test('a withdrawal needs an amount you have, a place, and an address for a wallet', () => {
  assert.deepEqual(withdrawReady({ amount: '50', available: 120, destination: 'wallet', address: A }), { ok: true });
  assert.deepEqual(withdrawReady({ amount: '50', available: 120, destination: 'karwan', address: '' }), { ok: true });
  assert.deepEqual(withdrawReady({ amount: '', available: 120, destination: 'wallet', address: A }), { ok: false, reason: 'amount' });
  assert.deepEqual(withdrawReady({ amount: '0', available: 120, destination: 'wallet', address: A }), { ok: false, reason: 'amount' });
  assert.deepEqual(withdrawReady({ amount: '1.1234567', available: 120, destination: 'wallet', address: A }), { ok: false, reason: 'amount' });
  assert.deepEqual(withdrawReady({ amount: '120.01', available: 120, destination: 'wallet', address: A }), { ok: false, reason: 'over' });
  assert.deepEqual(withdrawReady({ amount: '120', available: 120, destination: 'wallet', address: A }), { ok: true });
  assert.deepEqual(withdrawReady({ amount: '50', available: null, destination: 'wallet', address: A }), { ok: true });
  assert.deepEqual(withdrawReady({ amount: '50', available: 120, destination: null, address: A }), { ok: false, reason: 'destination' });
  assert.deepEqual(withdrawReady({ amount: '50', available: 120, destination: 'wallet', address: '0x123' }), { ok: false, reason: 'address' });
});
