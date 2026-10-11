import assert from 'node:assert/strict';
import test from 'node:test';
import type { FactoringOffer } from '@/core/api';
import { positionsSummary, showFilters, termKey } from './deskModel';

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
