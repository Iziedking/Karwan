import assert from 'node:assert/strict';
import test from 'node:test';
import {
  factoringOfferable,
  financingVisible,
  poFinancingOfferable,
  type FinancingDeal,
} from './financingEligibility.js';

/// The deal from the report, as the database actually holds it:
/// 0xda6c1d01…ae63a, goods, finance lane, delivered against a tracked shipment
/// and no delivery link. Kept as real values so the regression is anchored to
/// the case rather than to a convenient invention.
const REPORTED: FinancingDeal = {
  tradeType: 'goods',
  tradeLane: 'finance',
  delivered: true,
  shipment: { trackingNumber: '1Z999AA10123456784' },
  deliveryProof: null,
  acceptedAt: 1787583095456,
};

/// The same deal in the window between escrow funding and delivery.
const BEFORE_DELIVERY: FinancingDeal = {
  ...REPORTED,
  delivered: false,
  shipment: null,
};

test('the reported deal can ask for early payout', () => {
  // It could not before: factoring measured delivery by deliveryProof, which a
  // goods deal never has, so this was false with a container already shipped.
  assert.equal(factoringOfferable(REPORTED, true), true);
});

test('the reported deal was offerable PO capital before it shipped', () => {
  // Nothing hid the PO card on this deal. The lane, the acceptance and the
  // undelivered state all passed, so the window was real and simply closed
  // when delivery was marked.
  assert.equal(poFinancingOfferable(BEFORE_DELIVERY, true), true);
  assert.equal(factoringOfferable(BEFORE_DELIVERY, true), false);
});

test('the two never overlap', () => {
  assert.equal(poFinancingOfferable(REPORTED, true), false);
  assert.equal(factoringOfferable(BEFORE_DELIVERY, true), false);
});

test('financing is private to the seller', () => {
  assert.equal(financingVisible(REPORTED, false), false);
  assert.equal(factoringOfferable(REPORTED, false), false);
  assert.equal(poFinancingOfferable(BEFORE_DELIVERY, false), false);
});

test('neither product reaches a P2P service deal', () => {
  const p2p: FinancingDeal = { ...REPORTED, tradeLane: 'service', tradeType: 'service' };
  assert.equal(factoringOfferable(p2p, true), false);
  assert.equal(poFinancingOfferable({ ...p2p, delivered: false }, true), false);
});

test('nothing is offerable before the buyer funds escrow', () => {
  assert.equal(poFinancingOfferable({ ...BEFORE_DELIVERY, acceptedAt: null }, true), false);
  assert.equal(factoringOfferable({ ...REPORTED, acceptedAt: null }, true), false);
});

test('a finished or contested deal is closed to both', () => {
  for (const over of [{ settledAt: 1 }, { cancelledAt: 1 }, { disputed: true }]) {
    assert.equal(factoringOfferable({ ...REPORTED, ...over }, true), false);
    assert.equal(poFinancingOfferable({ ...BEFORE_DELIVERY, ...over }, true), false);
  }
});

test('an existing line or request closes the other product', () => {
  assert.equal(factoringOfferable({ ...REPORTED, poFinancingRequestedAt: 1 }, true), false);
  assert.equal(factoringOfferable({ ...REPORTED, factoringOfferId: 'f1' }, true), false);
  assert.equal(poFinancingOfferable({ ...BEFORE_DELIVERY, factoringRequestedAt: 1 }, true), false);
  assert.equal(poFinancingOfferable({ ...BEFORE_DELIVERY, poFinancingId: 'p1' }, true), false);
});

test('a service deal in the finance lane still factors on its link', () => {
  const services: FinancingDeal = {
    tradeType: 'service',
    tradeLane: 'finance',
    delivered: true,
    deliveryProof: 'https://example.test/handover',
    acceptedAt: 1,
  };
  assert.equal(factoringOfferable(services, true), true);
});
