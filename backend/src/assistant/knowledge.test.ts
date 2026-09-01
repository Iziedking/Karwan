import assert from 'node:assert/strict';
import test from 'node:test';
import { KARWAN_ASSISTANT_SYSTEM, KARWAN_PRODUCT_IDENTITY } from './knowledge.js';

test('assistant identifies Karwan as an open market for local and cross-border trade', () => {
  assert.equal(
    KARWAN_PRODUCT_IDENTITY,
    'Karwan is an open market for secure local and cross-border trade.',
  );
  assert.match(KARWAN_ASSISTANT_SYSTEM, /People and businesses can buy or sell services, goods, supplies/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /A trade may be local/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /or cross-border/);
});

test('assistant keeps current and planned market capabilities separate', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /browser companion, mainnet settlement, and local bank payout corridors are planned and are not live today/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /A local trade can still be created today, but its current settlement is test USDC/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /limited to eligible Karwan-originated accepted invoices or purchase orders/);
});

test('assistant keeps all three wallet roles distinct', () => {
  assert.match(KARWAN_ASSISTANT_SYSTEM, /SIGN-IN or identity wallet/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /BUYER AGENT wallet/);
  assert.match(KARWAN_ASSISTANT_SYSTEM, /SELLER AGENT wallet/);
  assert.doesNotMatch(KARWAN_ASSISTANT_SYSTEM, /AGENT wallets hold no funds of their own/);
});
