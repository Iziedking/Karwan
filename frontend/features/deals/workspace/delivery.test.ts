import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryNeedsPhoto, deliveryNeedsShipment, deliveryReady } from './delivery';

/// What the deliver sheet asks for and when it lets the seller submit. Goods
/// and mixed orders state the carrier and tracking reference the buyer can
/// follow; services hand over a proof of the work.
///
///   npx tsx --test features/deals/workspace/delivery.test.ts

const dhl = { slug: 'dhl', needsUrl: false };
const other = { slug: 'other', needsUrl: true };
const empty = { carrier: '', trackingNumber: '', trackingUrl: '' };

test('goods and mixed orders ask for the shipment; services do not', () => {
  assert.equal(deliveryNeedsShipment('goods'), true);
  assert.equal(deliveryNeedsShipment('mixed'), true);
  assert.equal(deliveryNeedsShipment('service'), false);
  assert.equal(deliveryNeedsShipment(undefined), false);
});

test('a goods delivery needs a carrier and a tracking number of at least 3 characters', () => {
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: empty, carrier: undefined }), false);
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: { ...empty, carrier: 'dhl', trackingNumber: 'AB' }, carrier: dhl }), false);
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: { ...empty, carrier: 'dhl', trackingNumber: 'AB1234' }, carrier: dhl }), true);
});

test('a carrier with no known tracking page needs an https link the buyer can open', () => {
  const shipment = { carrier: 'other', trackingNumber: 'REF-889', trackingUrl: '' };
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment, carrier: other }), false);
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: { ...shipment, trackingUrl: 'http://x.example/t' }, carrier: other }), false);
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: { ...shipment, trackingUrl: 'https://track.example/REF-889' }, carrier: other }), true);
});

test('a service delivery needs the proof', () => {
  assert.equal(deliveryReady({ tradeType: 'service', proof: '  ', shipment: empty, carrier: undefined }), false);
  assert.equal(deliveryReady({ tradeType: 'service', proof: 'https://drive.example/logo', shipment: empty, carrier: undefined }), true);
});

test('goods handed over in person need the six-digit code instead of a carrier', () => {
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: empty, carrier: undefined, handoverCode: '12345' }), false);
  assert.equal(deliveryReady({ tradeType: 'goods', proof: '', shipment: empty, carrier: undefined, handoverCode: ' 123456 ' }), true);
});

test('goods over 50 USDC wait for a photo of the item', () => {
  const ready = { tradeType: 'goods' as const, proof: '', shipment: { ...empty, carrier: 'dhl', trackingNumber: 'AB1234' }, carrier: dhl };
  assert.equal(deliveryNeedsPhoto({ tradeType: 'goods', dealAmountUsdc: '50' }), false);
  assert.equal(deliveryNeedsPhoto({ tradeType: 'goods', dealAmountUsdc: '50.5' }), true);
  assert.equal(deliveryNeedsPhoto({ tradeType: 'service', dealAmountUsdc: '500' }), false);
  assert.equal(deliveryReady({ ...ready, photoRequired: true, photos: 0 }), false);
  assert.equal(deliveryReady({ ...ready, photoRequired: true, photos: 1 }), true);
});
