import assert from 'node:assert/strict';
import test from 'node:test';
import { modularWalletsEnabled } from './config';

const url = 'https://modular-sdk.circle.com/v1/rpc/w3s/buidl';

test('mainnet always uses passkey wallets with a live key', () => {
  assert.equal(modularWalletsEnabled({ network: 'mainnet', userWallets: undefined, key: 'LIVE_CLIENT_KEY:x:y', url }), true);
  assert.equal(modularWalletsEnabled({ network: 'mainnet', userWallets: undefined, key: 'TEST_CLIENT_KEY:x:y', url }), false);
});

test('testnet opts in, and only with a sandbox key', () => {
  assert.equal(modularWalletsEnabled({ network: 'testnet', userWallets: undefined, key: 'TEST_CLIENT_KEY:x:y', url }), false);
  assert.equal(modularWalletsEnabled({ network: 'testnet', userWallets: 'modular', key: 'TEST_CLIENT_KEY:x:y', url }), true);
  assert.equal(modularWalletsEnabled({ network: 'testnet', userWallets: 'modular', key: 'LIVE_CLIENT_KEY:x:y', url }), false);
});

test('nothing without a key and URL', () => {
  assert.equal(modularWalletsEnabled({ network: 'mainnet', userWallets: undefined, key: null, url }), false);
  assert.equal(modularWalletsEnabled({ network: 'mainnet', userWallets: undefined, key: 'LIVE_CLIENT_KEY:x:y', url: null }), false);
});
