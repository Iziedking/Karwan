import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { wrongChoices } from './wrongChoices';

/// Something is wrong: three plain choices for the buyer once something was delivered (view 44, P11).
///
///   npx tsx --test features/deals/workspace/wrongChoices.test.ts

const deal = (over: Partial<DirectDeal> = {}) => ({
  jobId: '0xjob', buyer: '0xb', seller: '0xs', dealAmountUsdc: '120', firstReleasePct: 100, terms: 't', createdAt: 0, updatedAt: 0, onChain: null,
  acceptedAt: 1, delivered: true, view: { stage: 'awaiting-final-release' }, ...over,
}) as unknown as DirectDeal;

test('the buyer of delivered work can ask for changes or say it is not what was agreed', () => {
  assert.deepEqual(wrongChoices(deal(), 'buyer'), ['changes', 'notAgreed']);
});

test('goods not yet marked arrived add Nothing arrived', () => {
  const shipment = { carrier: 'dhl', carrierName: 'DHL', trackingNumber: '1', trackingUrl: null, dispatchedAt: 1 };
  assert.deepEqual(wrongChoices(deal({ tradeType: 'goods', shipment }), 'buyer'), ['changes', 'notAgreed', 'nothingArrived']);
  assert.deepEqual(wrongChoices(deal({ tradeType: 'goods', shipment: { ...shipment, arrivedAt: 2 } }), 'buyer'), ['changes', 'notAgreed']);
});

test('the seller, and anyone before a delivery, keep the usual options', () => {
  assert.equal(wrongChoices(deal(), 'seller'), null);
  assert.equal(wrongChoices(deal(), null), null);
  assert.equal(wrongChoices(deal({ delivered: false, view: { stage: 'awaiting-delivery' } as DirectDeal['view'] }), 'buyer'), null);
  assert.equal(wrongChoices(deal({ view: { stage: 'disputed' } as DirectDeal['view'] }), 'buyer'), null);
});
