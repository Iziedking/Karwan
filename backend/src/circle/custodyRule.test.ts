import assert from 'node:assert/strict';
import test from 'node:test';
import { identityWalletAllowed } from './custodyRule.js';

test('testnet provisions identity wallets for every account', () => {
  assert.equal(identityWalletAllowed({ testnet: true, purpose: 'email', chatCustodyEnabled: false }), true);
  assert.equal(identityWalletAllowed({ testnet: true, purpose: 'chat', chatCustodyEnabled: false }), true);
});

test('mainnet refuses without the chat flag', () => {
  assert.equal(identityWalletAllowed({ testnet: false, purpose: 'chat', chatCustodyEnabled: false }), false);
});

test('mainnet allows a WhatsApp account with the flag', () => {
  assert.equal(identityWalletAllowed({ testnet: false, purpose: 'chat', chatCustodyEnabled: true }), true);
});

test('mainnet still refuses an email signup even with the flag', () => {
  assert.equal(identityWalletAllowed({ testnet: false, purpose: 'email', chatCustodyEnabled: true }), false);
});
