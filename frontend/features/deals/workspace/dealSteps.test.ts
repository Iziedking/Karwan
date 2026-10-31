import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { dealKindOf, dealSteps, moneySplit } from './dealSteps';

/// The steps of a deal for its kind (view 44, spec section 6).
///
///   npx tsx --test features/deals/workspace/dealSteps.test.ts

const NOW = Date.UTC(2026, 10, 1);

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: `0x${'ab'.repeat(32)}`,
    buyer: '0x1111111111111111111111111111111111111111',
    seller: '0x2222222222222222222222222222222222222222',
    dealAmountUsdc: '120',
    firstReleasePct: 100,
    terms: 'Logo',
    delivered: false,
    createdAt: NOW,
    updatedAt: NOW,
    onChain: null,
    ...over,
  } as DirectDeal;
}

const states = (d: DirectDeal) => dealSteps(d).map((s) => `${s.key}${s.stage ? s.stage : ''}:${s.state}`);

test('a deal is one payment, in stages, shipped or handed over', () => {
  assert.equal(dealKindOf(deal()), 'one');
  assert.equal(dealKindOf(deal({ firstReleasePct: 50 })), 'stages');
  assert.equal(dealKindOf(deal({ milestonePcts: [30, 70] })), 'stages');
  assert.equal(dealKindOf(deal({ tradeType: 'goods' })), 'shipped');
  assert.equal(dealKindOf(deal({ tradeType: 'goods', goodsWay: 'in_person' })), 'in_person');
});

test('one payment walks Agreed, Paid in, Delivered, Paid out', () => {
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW })), ['agreed:done', 'paidIn:current', 'delivered:upcoming', 'paidOut:upcoming']);
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW, acceptedAt: NOW })), ['agreed:done', 'paidIn:done', 'delivered:current', 'paidOut:upcoming']);
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, delivered: true })), ['agreed:done', 'paidIn:done', 'delivered:done', 'paidOut:current']);
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, delivered: true, settledAt: NOW })), ['agreed:done', 'paidIn:done', 'delivered:done', 'paidOut:done']);
  assert.deepEqual(states(deal()), ['agreed:current', 'paidIn:upcoming', 'delivered:upcoming', 'paidOut:upcoming']);
});

test('shipped goods go On the way, then Arrived', () => {
  const shipped = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '1', trackingUrl: null, dispatchedAt: NOW };
  const base = { tradeType: 'goods' as const, sellerApprovedAt: NOW, acceptedAt: NOW };
  assert.deepEqual(states(deal(base)), ['agreed:done', 'paidIn:done', 'onTheWay:current', 'arrived:upcoming', 'paidOut:upcoming']);
  assert.deepEqual(states(deal({ ...base, delivered: true, shipment: shipped })), ['agreed:done', 'paidIn:done', 'onTheWay:done', 'arrived:current', 'paidOut:upcoming']);
  assert.deepEqual(states(deal({ ...base, delivered: true, shipment: { ...shipped, arrivedAt: NOW } })), ['agreed:done', 'paidIn:done', 'onTheWay:done', 'arrived:done', 'paidOut:current']);
});

test('goods handed over in person count the handover', () => {
  const base = { tradeType: 'goods' as const, goodsWay: 'in_person' as const, sellerApprovedAt: NOW, acceptedAt: NOW };
  assert.deepEqual(states(deal(base)), ['agreed:done', 'paidIn:done', 'handedOver:current', 'paidOut:upcoming']);
  assert.deepEqual(
    states(deal({ ...base, delivered: true, deliveryHistory: [{ revision: 1, submittedAt: NOW, handedOverAt: NOW }] })),
    ['agreed:done', 'paidIn:done', 'handedOver:done', 'paidOut:current'],
  );
});

test('stages show each part, and what is paid out and still held', () => {
  const half = deal({ sellerApprovedAt: NOW, acceptedAt: NOW, delivered: true, firstReleasePct: 50, milestonePcts: [50, 50], onChain: { state: 2, milestonePcts: [50, 50], milestonesReleased: 1 } as DirectDeal['onChain'] });
  assert.deepEqual(states(half), ['agreed:done', 'paidIn:done', 'stage1:done', 'stage2:current']);
  assert.deepEqual(moneySplit(half), { paidOutUsdc: '60', heldUsdc: '60' });
  const delivered = dealSteps(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, delivered: true, milestonePcts: [30, 70], firstReleasePct: 30 }));
  assert.deepEqual(delivered.map((s) => s.stageLine ?? null), [null, null, 'delivered', null]);
  assert.equal(moneySplit(deal({ sellerApprovedAt: NOW })), null);
  assert.deepEqual(moneySplit(deal({ dealAmountUsdc: '100.5', milestonePcts: [30, 70], firstReleasePct: 30, acceptedAt: NOW })), { paidOutUsdc: '0', heldUsdc: '100.5' });
});

test('a cancelled deal shows what happened', () => {
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, cancelledAt: NOW })), ['agreed:done', 'paidIn:done', 'cancelled:done', 'refunded:current']);
  assert.deepEqual(
    states(deal({ sellerApprovedAt: NOW, acceptedAt: NOW, cancelledAt: NOW, onChain: { state: 5, milestonePcts: [100], milestonesReleased: 0 } as DirectDeal['onChain'] })),
    ['agreed:done', 'paidIn:done', 'cancelled:done', 'refunded:done'],
  );
  assert.deepEqual(states(deal({ cancelledAt: NOW })), ['cancelled:done']);
  assert.deepEqual(states(deal({ sellerApprovedAt: NOW, cancelledAt: NOW })), ['agreed:done', 'cancelled:done']);
});
