import assert from 'node:assert/strict';
import test from 'node:test';
import { faucetPath } from './faucetPath.js';

test('a person asking for test USDC on Arc gets it from the faucet API', () => {
  assert.equal(faucetPath('ARC-TESTNET', 'request'), 'api');
});

test('sign-up does not spend the day\'s Arc drips', () => {
  assert.equal(faucetPath('ARC-TESTNET', 'signup'), 'skip');
});

test('chains the faucet API refuses stay on the web faucet', () => {
  assert.equal(faucetPath('ETH-SEPOLIA', 'request'), 'web');
  assert.equal(faucetPath('ETH-SEPOLIA', 'signup'), 'web');
});

test('other source chains drip from the API as before', () => {
  assert.equal(faucetPath('BASE-SEPOLIA', 'request'), 'api');
  assert.equal(faucetPath('SOL-DEVNET', 'request'), 'api');
});
