import { test } from 'node:test';
import assert from 'node:assert/strict';

const { assertSuccessfulReceipt } = await import('./txs.js');

test('rejects a transaction that Circle marked complete but reverted on chain', () => {
  assert.throws(
    () => assertSuccessfulReceipt('factoring.assignReceivable(offer-1)', '0xb49e69f5a7273b8625f9a171b078b8becd60e455883a93dbf977d59f16e77d92', { status: 'reverted' }),
    /reverted on chain/,
  );
});

test('accepts a successful on-chain receipt', () => {
  assert.doesNotThrow(() => assertSuccessfulReceipt('factoring.assignReceivable(offer-1)', '0xb49e69f5a7273b8625f9a171b078b8becd60e455883a93dbf977d59f16e77d92', { status: 'success' }));
});
