import assert from 'node:assert/strict';
import test from 'node:test';
import { guaranteeAccruals, mergeAccruals } from './guaranteeYield.js';

const A = '0x00000000000000000000000000000000000000aa';
const B = '0x00000000000000000000000000000000000000bb';
const U = 1_000_000n;

test('each guarantee earns the day rate on everything still in the vault', () => {
  const out = guaranteeAccruals([{ payee: A, active: 1_000n * U }, { payee: B, active: 50n * U }], 1n);
  assert.equal(out.get(A), 100_000n);
  assert.equal(out.get(B), 5_000n);
});

test('empty guarantees, missing payees and amounts that round to nothing earn nothing', () => {
  const out = guaranteeAccruals([{ payee: A, active: 0n }, { payee: null, active: 100n * U }, { payee: B, active: 9_999n }], 1n);
  assert.equal(out.size, 0);
});

test('one person with stake on both vaults gets one credit row', () => {
  const merged = mergeAccruals(new Map([[A.toUpperCase().replace('0X', '0x'), 10n]]), new Map([[A, 5n], [B, 1n]]));
  assert.equal(merged.size, 2);
  assert.equal(merged.get(A), 15n);
  assert.equal(merged.get(B), 1n);
});
