import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { deliveryCard, linksIn, noteWithoutLinks } from './deliveryCard';

function deal(extra: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xjob',
    buyer: '0x1',
    seller: '0x2',
    dealAmountUsdc: '100',
    firstReleasePct: 100,
    terms: 'Logo',
    delivered: true,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  } as DirectDeal;
}

const shipment = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '1234567890', trackingUrl: 'https://dhl.example/1234567890', dispatchedAt: 5 };

test('links are found inside a sentence, without trailing punctuation, once each', () => {
  assert.deepEqual(linksIn('Here it is: https://drive.google.com/x/view, and the repo (https://github.com/a/b). Again https://drive.google.com/x/view'), [
    { url: 'https://drive.google.com/x/view', host: 'drive.google.com' },
    { url: 'https://github.com/a/b', host: 'github.com' },
  ]);
  assert.deepEqual(linksIn('no link here'), []);
  assert.equal(noteWithoutLinks('Final files https://www.figma.com/file/1 thanks'), 'Final files thanks');
  assert.equal(noteWithoutLinks('https://www.figma.com/file/1'), null);
});

test('nothing delivered means no card', () => {
  assert.equal(deliveryCard(deal({ delivered: false }), true), null);
});

test('a note with a link shows the link to open, and only the buyer sees their own review', () => {
  const card = deliveryCard(deal({ deliveryProof: 'Logo pack https://drive.google.com/x', deliveryMatch: { verdict: 'aligned', reason: 'Three logos' } }), true)!;
  assert.deepEqual(card.links, [{ url: 'https://drive.google.com/x', host: 'drive.google.com' }]);
  assert.equal(card.note, 'Logo pack');
  assert.equal(card.match?.verdict, 'aligned');
  assert.equal(deliveryCard(deal({ deliveryMatch: { verdict: 'aligned', reason: 'x' } }), false)!.match, null);
});

test('a link held as unsafe is never shown to the buyer', () => {
  const card = deliveryCard(deal({ deliveryProof: 'https://bad.example', verificationStatus: 'suspicious' }), true)!;
  assert.equal(card.held, true);
  assert.deepEqual(card.links, []);
});

test('goods show where they are, and the buyer can confirm arrival until it is confirmed', () => {
  const card = deliveryCard(deal({ tradeType: 'goods', shipment }), true)!;
  assert.equal(card.shipment?.trackingNumber, '1234567890');
  assert.equal(card.canConfirmArrival, true);
  assert.equal(deliveryCard(deal({ tradeType: 'goods', shipment }), false)!.canConfirmArrival, false);
  assert.equal(deliveryCard(deal({ tradeType: 'goods', shipment: { ...shipment, arrivedAt: 9 } }), true)!.canConfirmArrival, false);
  assert.equal(deliveryCard(deal({ tradeType: 'goods', shipment, settledAt: 9 }), true)!.canConfirmArrival, false);
});

test('a milestone deal names the milestone and keeps the earlier deliveries, newest first', () => {
  const card = deliveryCard(
    deal({
      firstReleasePct: 50,
      milestonePcts: [50, 50],
      deliveredMilestone: 1,
      deliveryProof: 'Part two https://drive.example/2',
      deliveryHistory: [
        { revision: 1, submittedAt: 10, milestone: 0, deliveryProof: 'Part one https://drive.example/1' },
        { revision: 2, submittedAt: 20, milestone: 1, deliveryProof: 'Part two https://drive.example/2' },
      ],
    }),
    true,
  )!;
  assert.deepEqual(card.milestone, { number: 2, total: 2 });
  assert.equal(card.earlier.length, 1);
  assert.equal(card.earlier[0].milestoneNumber, 1);
  assert.equal(card.earlier[0].links[0].url, 'https://drive.example/1');
});

test('a handover shows when it was handed over, not a shipment, and its photos', () => {
  const card = deliveryCard(
    deal({
      tradeType: 'goods',
      shipment: { carrier: 'handover', carrierName: 'In person', trackingNumber: '', trackingUrl: null, dispatchedAt: 7, arrivedAt: 7 },
      deliveryPhotos: { revision: 1, count: 2 },
    }),
    true,
  )!;
  assert.equal(card.shipment, null);
  assert.equal(card.handedOverAt, 7);
  assert.equal(card.canConfirmArrival, false);
  assert.equal(card.photos.length, 2);
  assert.match(card.photos[1], /\/api\/deals\/direct\/0xjob\/delivery-photos\/1\/1$/);
});

test('photos of a delivery held as unsafe are not shown to the buyer', () => {
  const card = deliveryCard(deal({ verificationStatus: 'malicious', deliveryPhotos: { revision: 1, count: 1 } }), true)!;
  assert.deepEqual(card.photos, []);
});
