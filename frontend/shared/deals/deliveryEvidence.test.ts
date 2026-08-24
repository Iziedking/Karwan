import assert from 'node:assert/strict';
import test from 'node:test';
import { hasDeliveryEvidence } from './deliveryEvidence.js';

const SHIPPED = { trackingNumber: '1Z999AA10123456784' };

test('a shipped goods deal counts as delivered evidence', () => {
  // The reported case: delivery had been made and no early-payout card showed.
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'goods', shipment: SHIPPED }),
    true,
  );
});

test('a goods deal delivered against nothing does not', () => {
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'goods' }), false);
});

test('service and legacy deals still deliver a link', () => {
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'service', deliveryProof: 'https://x.test/a' }),
    true,
  );
  assert.equal(hasDeliveryEvidence({ delivered: true, deliveryProof: 'https://x.test/a' }), true);
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'service' }), false);
});

test('mixed takes either', () => {
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'mixed', shipment: SHIPPED }), true);
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'mixed', deliveryProof: 'https://x.test/a' }),
    true,
  );
});

test('not delivered is not delivered', () => {
  assert.equal(hasDeliveryEvidence({ tradeType: 'goods', shipment: SHIPPED }), false);
});
