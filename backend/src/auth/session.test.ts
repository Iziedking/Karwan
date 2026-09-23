import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionChainOk } from './session.js';

const testnet = { chainId: 5042002, testnet: true };
const mainnet = { chainId: 5042, testnet: false };

test('a session only counts on the chain it was issued for', () => {
  assert.equal(sessionChainOk(5042002, testnet), true);
  assert.equal(sessionChainOk(5042, mainnet), true);
  assert.equal(sessionChainOk(5042002, mainnet), false);
  assert.equal(sessionChainOk(5042, testnet), false);
});

test('sessions issued before the chain was recorded stay valid on testnet only', () => {
  assert.equal(sessionChainOk(undefined, testnet), true);
  assert.equal(sessionChainOk(undefined, mainnet), false);
});
