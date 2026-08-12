import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPoFunded, assertPoTerminal } from './poIntegrity.js';

const expected = {
  financier: '0xa045e8104bc066fff5bfc673abf354871edc03c5',
  seller: '0x6b51256e2a8e746d771763b4c274f17aa65f4922',
  principalUsdc: 90n,
  repayUsdc: 100n,
  requiredStakeUsdc: 18n,
};

test('rejects a reverted or mismatched po funding transaction', () => {
  assert.throws(
    () => assertPoFunded('reverted', expected.financier, { ...expected, state: 1 }, expected),
    /reverted on chain/,
  );
  assert.throws(
    () => assertPoFunded('success', expected.financier, { ...expected, state: 1, financier: expected.seller }, expected),
    /contract state mismatch/,
  );
  assert.throws(
    () => assertPoFunded('success', expected.financier, { ...expected, state: 1, requiredStakeUsdc: 0n }, expected),
    /contract state mismatch/,
  );
});

test('accepts only the expected po terminal state', () => {
  assert.doesNotThrow(() => assertPoTerminal('success', 2, 2));
  assert.throws(() => assertPoTerminal('success', 1, 2), /state mismatch/);
  assert.throws(() => assertPoTerminal('reverted', 2, 2), /reverted on chain/);
});
