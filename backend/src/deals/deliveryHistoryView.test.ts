import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryForAssistant, deliveryHistoryFor } from './deliveryHistoryView.js';

const history = [
  { revision: 1, submittedAt: 1, milestone: 0, deliveryProof: 'Logo https://bad.example/x', verificationStatus: 'suspicious' as const, deliveryMatch: { verdict: 'partial' as const, reason: 'Only one logo' } },
  { revision: 2, submittedAt: 2, milestone: 0, deliveryProof: 'Fixed https://drive.example/y', verificationStatus: 'clean' as const, deliveryMatch: { verdict: 'aligned' as const, reason: 'Three logos' } },
  { revision: 3, submittedAt: 3, milestone: 1, shipment: { carrierName: 'DHL', trackingNumber: '1234567890', trackingUrl: 'https://dhl.example/1234567890' } },
];

test('the buyer sees every delivery and their own review, but never a link held as unsafe', () => {
  const view = deliveryHistoryFor(history as never, 'buyer');
  assert.equal(view[0].deliveryProof, undefined);
  assert.equal(view[0].held, true);
  assert.equal(view[1].deliveryProof, 'Fixed https://drive.example/y');
  assert.deepEqual(view[1].deliveryMatch, { verdict: 'aligned', reason: 'Three logos' });
  assert.equal(view[2].milestone, 1);
  assert.equal(view[2].shipment?.trackingNumber, '1234567890');
});

test("the seller sees their own deliveries, never the buyer's review", () => {
  const view = deliveryHistoryFor(history as never, 'seller');
  assert.equal(view[0].deliveryProof, 'Logo https://bad.example/x');
  assert.equal(view.some((entry) => 'deliveryMatch' in entry), false);
});

test('no history reads as an empty list', () => {
  assert.deepEqual(deliveryHistoryFor(undefined, 'buyer'), []);
});

test('the assistant tells the buyer where the goods are and what was delivered, under the page rules', () => {
  const deal = {
    jobId: '0xjob', buyer: '0xb', seller: '0xs', dealAmountUsdc: '80', firstReleasePct: 100, delivered: true, createdAt: 1,
    deliveredAt: 1_790_000_000_000,
    deliveryProof: 'Phone packed, photo https://drive.example/p.jpg',
    deliveryMatch: { verdict: 'aligned', reason: 'Same model' },
    shipment: { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '1234567890', trackingUrl: 'https://dhl.example/t', dispatchedAt: 1_790_000_000_000 },
    deliveryHistory: [{ revision: 1, submittedAt: 1 }],
  };
  const buyer = deliveryForAssistant(deal as never, 'buyer')!;
  assert.deepEqual(buyer.links, ['https://drive.example/p.jpg']);
  assert.equal((buyer.shipment as { trackingPage: string }).trackingPage, 'https://dhl.example/t');
  assert.equal((buyer.shipment as { buyerCanConfirmArrival: boolean }).buyerCanConfirmArrival, true);
  assert.deepEqual(buyer.matchesRequest, { verdict: 'aligned', reason: 'Same model' });
  const seller = deliveryForAssistant(deal as never, 'seller')!;
  assert.equal('matchesRequest' in seller, false);
  assert.equal((seller.shipment as { buyerCanConfirmArrival: boolean }).buyerCanConfirmArrival, false);
  const held = deliveryForAssistant({ ...deal, verificationStatus: 'suspicious' } as never, 'buyer')!;
  assert.deepEqual(held.links, []);
  assert.equal(held.note, null);
  assert.equal(deliveryForAssistant({ ...deal, delivered: false, shipment: undefined, deliveryHistory: [] } as never, 'buyer'), null);
});
