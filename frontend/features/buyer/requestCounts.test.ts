import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuyerJob } from '@/core/api';
import { openRequestCount } from './requestCounts';

const job = (over: Partial<BuyerJob>): BuyerJob => ({
  jobId: `0x${Math.random().toString(16).slice(2)}`,
  buyer: '0xb',
  budgetUsdc: '100',
  deadlineUnix: 1_800_000_000,
  termsHash: '0x',
  finalized: false,
  escrowFunded: false,
  bids: [],
  lastCounterPriceBySeller: {},
  counterRoundsBySeller: {},
  ...over,
});

test('only requests still running are counted', () => {
  const jobs = [
    job({}),
    job({ finalized: true }),
    job({ cancelledAt: 1 }),
    job({ expiredAt: 1 }),
    job({ escrowFunded: true, finalized: true }),
  ];
  assert.equal(openRequestCount(jobs), 2);
});

test('three cancelled requests count as none', () => {
  assert.equal(openRequestCount([job({ cancelledAt: 1 }), job({ cancelledAt: 2 }), job({ cancelledAt: 3 })]), 0);
});
