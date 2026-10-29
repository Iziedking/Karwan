import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal, FactoringOffer } from '@/core/api';
import { getPaidNowView } from './getPaidNow';

/// Get paid now on the deal page (view 18): a business order on the escrow
/// family can ask from acceptance, and each offer says what it holds.

const NOW = 1_800_000_000_000;
const deal = (over: Partial<DirectDeal> = {}) =>
  ({ jobId: '0xjob', tradeLane: 'finance', escrowVersion: 'suite', acceptedAt: 1, dealAmountUsdc: '150', ...over }) as DirectDeal;
const offer = (over: Partial<FactoringOffer> = {}) =>
  ({ id: 'o1', status: 'offered', expiresAt: NOW + 1000, offeredAdvanceUsdc: '120', expectedReturnUsdc: '123.6', holdUsdc: '12', recommended: true, funded: true, ...over }) as FactoringOffer;

test('a family business deal can ask before delivery', () => {
  const v = getPaidNowView({ deal: deal({ delivered: false } as Partial<DirectDeal>), viewerIsSeller: true, offers: [], now: NOW });
  assert.equal(v.canAsk, true);
});

test('only the seller of a live business deal on the family sees it', () => {
  for (const over of [{ tradeLane: 'service' }, { escrowVersion: 'v2' }, { acceptedAt: undefined }, { settledAt: 5 }, { disputed: true }] as Array<Partial<DirectDeal>>) {
    assert.equal(getPaidNowView({ deal: deal(over), viewerIsSeller: true, offers: [], now: NOW }).canAsk, false, JSON.stringify(over));
  }
  assert.equal(getPaidNowView({ deal: deal(), viewerIsSeller: false, offers: [], now: NOW }).canAsk, false);
});

test('each open offer shows now, back and the hold; a short guarantee shows the gap', () => {
  const v = getPaidNowView({ deal: deal(), viewerIsSeller: true, offers: [offer({ gapUsdc: '8' }), offer({ id: 'o2', expiresAt: NOW - 1 })], now: NOW });
  assert.deepEqual(v.offers, [{ id: 'o1', nowUsdc: '120', backUsdc: '123.6', holdUsdc: '12', gapUsdc: '8', recommended: true, funded: true }]);
});

test('a waiting offer hides the others and shows the deadline', () => {
  const v = getPaidNowView({ deal: deal(), viewerIsSeller: true, offers: [offer({ id: 'w', status: 'awaiting_financier', waitingForFinancier: true, sellerDeadline: NOW + 5 }), offer()], now: NOW });
  assert.deepEqual(v.waiting, { offerId: 'w', deadline: NOW + 5 });
  assert.deepEqual(v.offers, []);
  assert.equal(v.canAsk, false);
});

test('a deal already paid early does not ask again', () => {
  assert.equal(getPaidNowView({ deal: deal({ factoringOfferId: 'o1' }), viewerIsSeller: true, offers: [], now: NOW }).canAsk, false);
});
