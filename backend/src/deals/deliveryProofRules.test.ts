import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryFingerprint, deliveryMethodOf, deliveryNeeds, methodFromKind } from './deliveryProofRules.js';

test('work needs a link; goods need a carrier or a handover; a photo only above 50 USDC', () => {
  const online = { method: 'online', goods: false, link: true, photo: false, handover: false };
  assert.deepEqual(deliveryNeeds({ tradeType: 'service', dealAmountUsdc: '500' }), online);
  assert.deepEqual(deliveryNeeds({ dealAmountUsdc: '20' }), online);
  assert.deepEqual(deliveryNeeds({ tradeType: 'goods', dealAmountUsdc: '50' }), { method: 'shipped', goods: true, link: false, photo: false, handover: false });
  assert.deepEqual(deliveryNeeds({ tradeType: 'goods', dealAmountUsdc: '50.01' }), { method: 'shipped', goods: true, link: false, photo: true, handover: false });
  assert.deepEqual(deliveryNeeds({ tradeType: 'mixed', dealAmountUsdc: '80' }), { method: 'shipped', goods: true, link: true, photo: true, handover: false });
});

test('work done in person ends in the buyer’s code, never a link (B-08, owner, 15 Nov 2026)', () => {
  assert.deepEqual(
    deliveryNeeds({ deliveryMethod: 'in_person', dealAmountUsdc: '222' }),
    { method: 'in_person', goods: true, link: false, photo: true, handover: true },
  );
  assert.deepEqual(
    deliveryNeeds({ deliveryMethod: 'in_person', tradeType: 'service', dealAmountUsdc: '30' }),
    { method: 'in_person', goods: true, link: false, photo: false, handover: true },
  );
  assert.equal(deliveryNeeds({ tradeType: 'goods', goodsWay: 'in_person', dealAmountUsdc: '10' }).handover, true);
});

test('older deals read their method from the trade type, a request from its delivery kind (view 85)', () => {
  assert.equal(deliveryMethodOf({}), 'online');
  assert.equal(deliveryMethodOf({ tradeType: 'service' }), 'online');
  assert.equal(deliveryMethodOf({ tradeType: 'goods' }), 'shipped');
  assert.equal(deliveryMethodOf({ tradeType: 'goods', goodsWay: 'in_person' }), 'in_person');
  assert.equal(deliveryMethodOf({ tradeType: 'goods', deliveryMethod: 'online' }), 'online');
  assert.equal(methodFromKind('remote'), 'online');
  assert.equal(methodFromKind('in_person'), 'in_person');
  assert.equal(methodFromKind('goods'), 'shipped');
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
