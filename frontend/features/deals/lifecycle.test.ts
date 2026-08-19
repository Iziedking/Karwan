import assert from 'node:assert/strict';
import test from 'node:test';

import type { DirectDeal } from '@/core/api';
import { stageOf } from './components/DirectDealList';

function deal(fields: Partial<DirectDeal>): DirectDeal {
  return {
    jobId: `0x${'11'.repeat(32)}`,
    buyer: `0x${'22'.repeat(20)}`,
    seller: `0x${'33'.repeat(20)}`,
    dealAmountUsdc: '100',
    terms: 'Test terms',
    firstReleasePct: 50,
    delivered: false,
    disputed: false,
    createdAt: 1,
    updatedAt: 1,
    onChain: null,
    ...fields,
  } as DirectDeal;
}

test('seller agreement creates a distinct unfunded stage', () => {
  assert.equal(stageOf(deal({})), 'awaiting-acceptance');
  assert.equal(stageOf(deal({ sellerApprovedAt: 2 })), 'awaiting-funding');
  assert.equal(stageOf(deal({ sellerApprovedAt: 2, acceptedAt: 3 })), 'awaiting-delivery');
});

test('terminal states still take priority over funding states', () => {
  assert.equal(
    stageOf(deal({ sellerApprovedAt: 2, acceptedAt: 3, cancelledAt: 4 })),
    'cancelled',
  );
  assert.equal(
    stageOf(deal({ sellerApprovedAt: 2, acceptedAt: 3, settledAt: 4 })),
    'settled',
  );
});
