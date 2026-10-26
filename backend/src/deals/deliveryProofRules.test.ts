import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFingerprint, deliveryNeeds } from './deliveryProofRules.js';

test('work needs a link; goods need a carrier or a handover; a photo only above 50 USDC', () => {
  assert.deepEqual(deliveryNeeds({ tradeType: 'service', dealAmountUsdc: '500' }), { goods: false, link: true, photo: false });
  assert.deepEqual(deliveryNeeds({ dealAmountUsdc: '20' }), { goods: false, link: true, photo: false });
  assert.deepEqual(deliveryNeeds({ tradeType: 'goods', dealAmountUsdc: '50' }), { goods: true, link: false, photo: false });
  assert.deepEqual(deliveryNeeds({ tradeType: 'goods', dealAmountUsdc: '50.01' }), { goods: true, link: false, photo: true });
  assert.deepEqual(deliveryNeeds({ tradeType: 'mixed', dealAmountUsdc: '80' }), { goods: true, link: true, photo: true });
});

test('the fingerprint changes with any part of the delivery', () => {
  const base = { deliveryProof: 'Packed', shipment: { carrier: 'dhl', trackingNumber: '1234567890', trackingUrl: 'https://dhl.example/t' }, photoHashes: ['0x01' as const] };
  const a = deliveryFingerprint(base);
  assert.equal(a, deliveryFingerprint({ ...base }));
  assert.notEqual(a, deliveryFingerprint({ ...base, deliveryProof: 'Packed!' }));
  assert.notEqual(a, deliveryFingerprint({ ...base, shipment: { ...base.shipment, trackingNumber: '1234567891' } }));
  assert.notEqual(a, deliveryFingerprint({ ...base, photoHashes: ['0x02'] }));
  assert.notEqual(a, deliveryFingerprint({ ...base, handedOverAt: 5 }));
});
