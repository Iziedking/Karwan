import assert from 'node:assert/strict';
import test from 'node:test';
import { previousEscrowDeals } from './previousEscrow';

const deal = (jobId: string, createdAt: number, stage?: string, previousEscrow = true) =>
  ({ jobId, createdAt, previousEscrow: previousEscrow || undefined, view: stage ? { stage } : undefined }) as never;

test('lists only deals from before the new escrow, open ones first, newest first within each', () => {
  const rows = previousEscrowDeals([
    deal('settled-new', 30, 'settled'),
    deal('open-old', 10, 'awaiting-delivery'),
    deal('family', 40, 'awaiting-delivery', false),
    deal('open-new', 20, 'awaiting-funding'),
    deal('cancelled', 50, 'cancelled'),
  ]);
  assert.deepEqual(rows.map((d) => d.jobId), ['open-new', 'open-old', 'cancelled', 'settled-new']);
});

test('nothing to list when no deal is from before', () => {
  assert.deepEqual(previousEscrowDeals([deal('family', 1, 'settled', false)]), []);
});
