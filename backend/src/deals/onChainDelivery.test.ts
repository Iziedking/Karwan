import assert from 'node:assert/strict';
import test from 'node:test';
import { onChainDeliveryAlert } from './onChainDelivery.js';

const base = { delivered: false, onChainDeliveryAlertedAt: undefined as number | undefined };

test('a delivery marked on the contract that we never recorded alerts the buyer', () => {
  const alert = onChainDeliveryAlert(base, { deliveredAt: 1_800_000_000n, claimDeadline: 1_800_000_300n });
  assert.deepEqual(alert, { deliveredAtMs: 1_800_000_000_000, claimableAtMs: 1_800_000_300_000 });
});

test('a delivery made through the app is already known and does not alert twice', () => {
  const alert = onChainDeliveryAlert({ ...base, delivered: true }, { deliveredAt: 1_800_000_000n, claimDeadline: 1_800_000_300n });
  assert.equal(alert, null);
});

test('nothing marked on chain means nothing to say', () => {
  assert.equal(onChainDeliveryAlert(base, { deliveredAt: 0n, claimDeadline: 0n }), null);
  assert.equal(onChainDeliveryAlert(base, {}), null);
});

test('the same on-chain mark alerts once, a new mark alerts again', () => {
  const account = { deliveredAt: 1_800_000_000n, claimDeadline: 1_800_000_300n };
  assert.equal(onChainDeliveryAlert({ ...base, onChainDeliveryAlertedAt: 1_800_000_000_000 }, account), null);
  const remarked = { deliveredAt: 1_800_000_900n, claimDeadline: 1_800_001_200n };
  assert.notEqual(onChainDeliveryAlert({ ...base, onChainDeliveryAlertedAt: 1_800_000_000_000 }, remarked), null);
});
