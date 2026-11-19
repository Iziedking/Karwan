import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { pictureFor } from './kindPictureModel';

const DAY = 86_400_000;
const at = Date.UTC(2026, 10, 18);

function deal(extra: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xjob',
    buyer: '0x1',
    seller: '0x2',
    dealAmountUsdc: '100',
    firstReleasePct: 100,
    terms: 'Logo',
    delivered: false,
    createdAt: at,
    updatedAt: at,
    sellerApprovedAt: at,
    acceptedAt: at,
    deadlineUnix: (at + 7 * DAY) / 1000,
    view: { stage: 'awaiting-delivery', money: { line: 'held' }, progress: [], next: { action: 'deliver', actor: 'counterparty', amountUsdc: null }, automatic: null, hold: null },
    ...extra,
  } as DirectDeal;
}

const goods = (extra: Partial<DirectDeal> = {}) => deal({ tradeType: 'goods', ...extra });
const shipment = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '7342119055', trackingUrl: null, dispatchedAt: at + DAY };

test('a goods deal before shipping asks the seller for tracking and tells the buyer to wait', () => {
  const seller = pictureFor(goods(), false);
  assert.equal(seller.kind, 'parcel');
  if (seller.kind !== 'parcel') return;
  assert.equal(seller.hint, 'addTracking');
  assert.equal(seller.trackingNumber, null);
  assert.equal(seller.dueAt, at + 7 * DAY);
  const buyer = pictureFor(goods(), true);
  assert.equal(buyer.kind === 'parcel' && buyer.hint, 'waitShip');
});

test('a shipped parcel shows carrier and number, with no link when the carrier has no page', () => {
  const picture = pictureFor(goods({ delivered: true, deliveredAt: at + DAY, shipment }), true);
  assert.equal(picture.kind, 'parcel');
  if (picture.kind !== 'parcel') return;
  assert.equal(picture.carrierName, 'DHL');
  assert.equal(picture.trackingNumber, '7342119055');
  assert.equal(picture.trackingUrl, null);
  assert.equal(picture.dispatchedAt, at + DAY);
  assert.equal(picture.hint, 'tapArrived');
  assert.equal(pictureFor(goods({ delivered: true, shipment }), false).kind === 'parcel' && (pictureFor(goods({ delivered: true, shipment }), false) as { hint: unknown }).hint, null);
});

test('with a tracking page the parcel keeps its link', () => {
  const picture = pictureFor(goods({ delivered: true, shipment: { ...shipment, trackingUrl: 'https://www.dhl.com/track?n=7342119055' } }), true);
  assert.equal(picture.kind === 'parcel' && picture.trackingUrl, 'https://www.dhl.com/track?n=7342119055');
});

test('an arrived parcel says so to both', () => {
  const arrived = goods({ delivered: true, shipment: { ...shipment, arrivedAt: at + 4 * DAY } });
  for (const viewerIsBuyer of [true, false]) {
    const picture = pictureFor(arrived, viewerIsBuyer);
    assert.equal(picture.kind === 'parcel' && picture.hint, 'arrived');
    assert.equal(picture.kind === 'parcel' && picture.arrivedAt, at + 4 * DAY);
  }
});

test("a one-job delivery shows its links and Karwan's check", () => {
  const delivered = deal({
    delivered: true,
    deliveredAt: at + 2 * DAY,
    deliveryProof: 'Final files here https://drive.google.com/file/d/abc thanks',
    deliveryMatch: { verdict: 'aligned', reason: 'Three logo versions.' },
    releaseEligibleAtMs: at + 9 * DAY,
    view: { stage: 'awaiting-final-release', money: { line: 'held' }, progress: [], next: { action: 'release', actor: 'you', amountUsdc: '100' }, automatic: null, hold: null },
  });
  const picture = pictureFor(delivered, true);
  assert.equal(picture.kind, 'delivery');
  if (picture.kind !== 'delivery') return;
  assert.equal(picture.links[0]?.host, 'drive.google.com');
  assert.equal(picture.note, 'Final files here thanks');
  assert.equal(picture.verdict, 'aligned');
  assert.equal(picture.deliveredAt, at + 2 * DAY);
  assert.equal(picture.hint, 'check');
  assert.equal(picture.payAt, at + 9 * DAY);
  const seller = pictureFor({ ...delivered, view: { ...delivered.view!, next: { action: 'release', actor: 'counterparty', amountUsdc: '100' } } }, false);
  assert.equal(seller.kind === 'delivery' && seller.hint, 'waitCheck');
  assert.equal(seller.kind === 'delivery' && seller.verdict, null);
});

test('a delivery held for a safety check shows no links to the buyer', () => {
  const picture = pictureFor(deal({ delivered: true, deliveryProof: 'https://evil.example/x', verificationStatus: 'malicious' } as Partial<DirectDeal>), true);
  assert.equal(picture.kind, 'delivery');
  if (picture.kind !== 'delivery') return;
  assert.equal(picture.held, true);
  assert.deepEqual(picture.links, []);
  assert.equal(picture.note, null);
});

test('a seller before delivery has no pay date', () => {
  const picture = pictureFor(deal({ releaseEligibleAtMs: null }), false);
  assert.equal(picture.kind, 'delivery');
  if (picture.kind !== 'delivery') return;
  assert.equal(picture.payAt, null);
  assert.equal(picture.hint, 'deliverBy');
  assert.equal(picture.deliveredAt, null);
  assert.equal(pictureFor(deal(), true).kind === 'delivery' && (pictureFor(deal(), true) as { hint: unknown }).hint, 'waitDelivery');
});

test('a disputed, cancelled or refunded deal has no picture', () => {
  assert.deepEqual(pictureFor(goods({ disputed: true, shipment }), true), { kind: 'steps' });
  assert.deepEqual(pictureFor(deal({ cancelledAt: at + DAY }), true), { kind: 'steps' });
  assert.deepEqual(pictureFor(deal({ cancelledAt: at + DAY, onChain: { state: 5 } } as Partial<DirectDeal>), false), { kind: 'steps' });
});

test('in person before the handover: the buyer gives the code, the seller asks for it', () => {
  const buyer = pictureFor(goods({ goodsWay: 'in_person' }), true);
  assert.deepEqual(buyer, { kind: 'handover', handedOverAt: null, hint: 'giveCode', payAt: null });
  const seller = pictureFor(goods({ goodsWay: 'in_person' }), false);
  assert.equal(seller.kind === 'handover' && seller.hint, 'askCode');
});

test('in person after the code: handed over, confirmed by the code', () => {
  const handed = goods({ goodsWay: 'in_person', delivered: true, deliveryHistory: [{ submittedAt: at + DAY, handedOverAt: at + DAY }], releaseEligibleAtMs: at + 3 * DAY } as Partial<DirectDeal>);
  assert.deepEqual(pictureFor(handed, true), { kind: 'handover', handedOverAt: at + DAY, hint: 'confirmed', payAt: at + 3 * DAY });
  const work = deal({ deliveryMethod: 'in_person', delivered: true, deliveryHistory: [{ submittedAt: at + DAY, handedOverAt: at + DAY }] } as Partial<DirectDeal>);
  assert.equal(pictureFor(work, false).kind === 'handover' && (pictureFor(work, false) as { hint: string }).hint, 'confirmed');
});

test('stages list each amount and where its money is', () => {
  const p = pictureFor(deal({ milestonePcts: [30, 30, 40], onChain: { milestonesReleased: 1 } } as Partial<DirectDeal>), true);
  assert.equal(p.kind, 'stages');
  if (p.kind !== 'stages') return;
  assert.deepEqual(p.stages, [
    { n: 1, amountUsdc: '30', state: 'paid' },
    { n: 2, amountUsdc: '30', state: 'due' },
    { n: 3, amountUsdc: '40', state: 'held' },
  ]);
  assert.equal(p.paidOutUsdc, '30');
  assert.equal(p.heldUsdc, '70');
});

test('stage amounts add up to the deal, the last stage taking the remainder', () => {
  const p = pictureFor(deal({ dealAmountUsdc: '100', milestonePcts: [33, 33, 34] }), true);
  assert.ok(p.kind === 'stages');
  if (p.kind !== 'stages') return;
  assert.deepEqual(p.stages.map((x) => x.amountUsdc), ['33', '33', '34']);
  const odd = pictureFor(deal({ dealAmountUsdc: '10.000001', milestonePcts: [50, 50] }), true);
  assert.ok(odd.kind === 'stages');
  if (odd.kind !== 'stages') return;
  assert.deepEqual(odd.stages.map((x) => x.amountUsdc), ['5', '5.000001']);
});

test('stages before the money is in hold nothing', () => {
  const p = pictureFor(deal({ milestonePcts: [50, 50], acceptedAt: undefined, fundTxHash: undefined }), true);
  assert.ok(p.kind === 'stages');
  if (p.kind !== 'stages') return;
  assert.deepEqual(p.stages.map((x) => x.state), ['later', 'later']);
  assert.equal(p.heldUsdc, null);
});

test('a finished stages deal shows every stage paid', () => {
  const p = pictureFor(deal({ milestonePcts: [50, 50], settledAt: at + 9 * DAY } as Partial<DirectDeal>), false);
  assert.ok(p.kind === 'stages');
  if (p.kind !== 'stages') return;
  assert.deepEqual(p.stages.map((x) => x.state), ['paid', 'paid']);
  assert.equal(p.heldUsdc, '0');
});
