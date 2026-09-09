import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMoneyRailProviderEvent,
  cancelMoneyRailIntent,
  createMoneyRailIntent,
  railCapability,
  startMoneyRailIntent,
} from './railIntent.js';

const base = {
  owner: '0xBuyer',
  idempotencyKey: 'deposit-request-1',
  rail: 'cctp_deposit' as const,
  direction: 'in' as const,
  inputCurrency: 'USDC',
  inputAmountMinor: '125000000',
  expectedUsdcMicros: '125000000',
  recipientAddress: '0xEscrow',
  sourceChain: 'base',
  provider: 'circle-cctp',
};

test('rail capabilities distinguish live Circle rails from configured fiat rails', () => {
  assert.equal(railCapability('cctp_deposit', new Set(['circle-cctp'])).state, 'live');
  assert.equal(railCapability('bank_deposit', new Set()).state, 'unavailable');
  assert.equal(railCapability('bank_deposit', new Set(['unconfigured'])).state, 'configured');
});

test('provider events are durable and duplicate delivery is idempotent', () => {
  let intent = createMoneyRailIntent(base, 100);
  intent = startMoneyRailIntent(intent, 110);
  intent = applyMoneyRailProviderEvent(intent, {
    key: 'evt-1',
    kind: 'submitted',
    providerReference: 'cctp-1',
  }, 120);
  const settled = applyMoneyRailProviderEvent(intent, {
    key: 'evt-2',
    kind: 'settled',
    providerReference: 'cctp-1',
    settlementReference: 'arc-tx-1',
    movementReference: 'KWN-AAAA-BBBB-CCCC',
  }, 130);
  assert.equal(settled.status, 'completed');
  assert.equal(settled.version, 4);
  assert.deepEqual(applyMoneyRailProviderEvent(settled, {
    key: 'evt-2',
    kind: 'settled',
    providerReference: 'cctp-1',
    settlementReference: 'arc-tx-1',
  }, 140), settled);
});

test('failed provider attempts can be retried without changing the intent identity', () => {
  let intent = startMoneyRailIntent(createMoneyRailIntent(base, 100), 110);
  intent = applyMoneyRailProviderEvent(intent, {
    key: 'evt-failed',
    kind: 'failed',
    failureCode: 'provider_timeout',
  }, 120);
  assert.equal(intent.status, 'needs_attention');
  const retried = startMoneyRailIntent(intent, 130);
  assert.equal(retried.status, 'awaiting_provider');
  assert.equal(retried.id, intent.id);
  assert.equal(retried.idempotencyKey, intent.idempotencyKey);
});

test('chain rails cannot be marked settled without a linked Karwan movement', () => {
  let intent = startMoneyRailIntent(createMoneyRailIntent(base, 100), 110);
  assert.throws(() => applyMoneyRailProviderEvent(intent, {
    key: 'evt-without-movement',
    kind: 'settled',
    providerReference: 'cctp-3',
    settlementReference: 'arc-tx-3',
  }, 120), /movement reference/);
});

test('created intents can be cancelled and completed intents can be refunded', () => {
  const created = createMoneyRailIntent(base, 100);
  assert.equal(cancelMoneyRailIntent(created, 110).status, 'cancelled');

  let completed = startMoneyRailIntent(createMoneyRailIntent({ ...base, idempotencyKey: 'deposit-request-2' }, 100), 110);
  completed = applyMoneyRailProviderEvent(completed, {
    key: 'evt-settled',
    kind: 'settled',
    providerReference: 'cctp-2',
    settlementReference: 'arc-tx-2',
    movementReference: 'KWN-AAAA-BBBB-CCCC',
  }, 120);
  const refunded = applyMoneyRailProviderEvent(completed, {
    key: 'evt-refunded',
    kind: 'refunded',
    providerReference: 'cctp-2',
    settlementReference: 'arc-refund-2',
  }, 130);
  assert.equal(refunded.status, 'refunded');
});
