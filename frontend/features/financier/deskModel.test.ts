import assert from 'node:assert/strict';
import test from 'node:test';
import type { FactoringOffer } from '@/core/api';
import type { DirectDeal } from '@/core/api';
import { groupPositions, invoiceTiming, positionsSummary, showFilters, termKey } from './deskModel';

const offer = (over: Partial<FactoringOffer>): FactoringOffer =>
  ({
    id: 'o',
    invoiceId: '0xi',
    financier: '0xf',
    seller: '0xs',
    faceValueUsdc: '500',
    offeredAdvanceUsdc: '196',
    expectedReturnUsdc: '200',
    discountBps: 200,
    status: 'accepted',
    offeredAt: 1,
    expiresAt: 2,
    ...over,
  }) as FactoringOffer;

test('the summary counts only live positions and adds money exactly', () => {
  const s = positionsSummary([
    offer({ offeredAdvanceUsdc: '0.1', expectedReturnUsdc: '0.2' }),
    offer({ offeredAdvanceUsdc: '0.2', expectedReturnUsdc: '0.3' }),
    offer({ status: 'settled', offeredAdvanceUsdc: '1000', expectedReturnUsdc: '1100' }),
    offer({ status: 'defaulted' }),
  ]);
  assert.deepEqual(s, { active: 2, outUsdc: '0.3', expectedUsdc: '0.5', needsReview: 1 });
});

test('no live positions gives zeros', () => {
  assert.deepEqual(positionsSummary([offer({ status: 'settled' })]), { active: 0, outUsdc: '0', expectedUsdc: '0', needsReview: 0 });
});

test('filters appear only when there is enough to filter or a filter is on', () => {
  assert.equal(showFilters(3, false), false);
  assert.equal(showFilters(7, false), true);
  assert.equal(showFilters(0, true), true);
});

test('payment terms map to copy keys, defaulting to on delivery', () => {
  assert.equal(termKey('net30'), 'net30');
  assert.equal(termKey('net90'), 'net90');
  assert.equal(termKey(null), 'immediate');
  assert.equal(termKey(undefined), 'immediate');
});

test('what needs the financier comes first, then live money, then finished history', () => {
  const g = groupPositions([
    offer({ id: 'old-repaid', status: 'repaid', settledAt: 50 }),
    offer({ id: 'new-repaid', status: 'settled', settledAt: 90 }),
    offer({ id: 'review', status: 'defaulted', settledAt: 10 }),
    offer({ id: 'live-old', status: 'accepted', acceptedAt: 20 }),
    offer({ id: 'pay', status: 'awaiting_financier', acceptedAt: 5 }),
    offer({ id: 'live-new', status: 'accepted', acceptedAt: 40 }),
    offer({ id: 'closed', status: 'waived', updatedAt: 70 }),
  ]);
  assert.deepEqual(g.needsYou.map((o) => o.id), ['pay', 'review']);
  assert.deepEqual(g.active.map((o) => o.id), ['live-new', 'live-old']);
  assert.deepEqual(g.history.map((o) => o.id), ['new-repaid', 'closed', 'old-repaid']);
});

test('an open request says whether the goods are delivered yet', () => {
  assert.equal(invoiceTiming({ delivered: false } as DirectDeal), 'beforeDelivery');
  assert.equal(invoiceTiming({ delivered: true } as DirectDeal), 'afterDelivery');
  assert.equal(invoiceTiming({ delivered: false, deliveredAt: 1 } as DirectDeal), 'afterDelivery');
});
