import assert from 'node:assert/strict';
import test from 'node:test';
import { dripBody } from './walk-bank.js';

test('the bank drip asks for Arc Testnet USDC only', () => {
  const address = '0x178f583CFEfC814f5A81F350081b8F29f5B4c649';
  assert.deepEqual(dripBody(address), { address, blockchain: 'ARC-TESTNET', usdc: true, native: false });
});

test('the bank drip refuses anything that is not an address', () => {
  assert.throws(() => dripBody('walk-bank'), /not an address/);
  assert.throws(() => dripBody('0x1234'), /not an address/);
});
