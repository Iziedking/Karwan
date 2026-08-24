import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceKindFor, hasDeliveryEvidence, isFactorable } from './deliveryEvidence.js';

const SHIPPED = { trackingNumber: '1Z999AA10123456784' };

test('a goods deal delivers against its shipment, not a link', () => {
  // The bug: a container shipped and tracked was not considered delivered
  // enough to factor, because it had no deliveryProof link. It never can.
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'goods', shipment: SHIPPED }),
    true,
  );
});

test('a goods deal marked delivered against nothing is not evidence', () => {
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'goods' }), false);
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'goods', shipment: { trackingNumber: '  ' } }),
    false,
  );
});

test('a service deal still delivers against its link', () => {
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'service', deliveryProof: 'https://x.test/a' }),
    true,
  );
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'service' }), false);
  // A link is not what a goods deal delivers against, and does not stand in.
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'goods', deliveryProof: 'https://x.test/a' }),
    false,
  );
});

test('a legacy deal with no trade type is a service deal', () => {
  assert.equal(evidenceKindFor('service'), 'link');
  assert.equal(hasDeliveryEvidence({ delivered: true, deliveryProof: 'https://x.test/a' }), true);
  assert.equal(hasDeliveryEvidence({ delivered: true, shipment: SHIPPED }), false);
});

test('a mixed deal takes either, so neither half strands it', () => {
  assert.equal(evidenceKindFor('mixed'), 'either');
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'mixed', shipment: SHIPPED }),
    true,
  );
  assert.equal(
    hasDeliveryEvidence({ delivered: true, tradeType: 'mixed', deliveryProof: 'https://x.test/a' }),
    true,
  );
  assert.equal(hasDeliveryEvidence({ delivered: true, tradeType: 'mixed' }), false);
});

test('nothing is delivered until it is marked delivered', () => {
  for (const trade of ['service', 'goods', 'mixed'] as const) {
    assert.equal(
      hasDeliveryEvidence({ tradeType: trade, deliveryProof: 'https://x.test/a', shipment: SHIPPED }),
      false,
    );
  }
});

test('factoring wants a delivered deal the buyer has not settled', () => {
  const shipped = { delivered: true, tradeType: 'goods' as const, shipment: SHIPPED, acceptedAt: 1 };
  assert.equal(isFactorable(shipped), true);
  assert.equal(isFactorable({ ...shipped, acceptedAt: undefined }), false);
  assert.equal(isFactorable({ ...shipped, settledAt: 2 }), false);
  assert.equal(isFactorable({ ...shipped, cancelledAt: 2 }), false);
  assert.equal(isFactorable({ ...shipped, disputed: true }), false);
});
