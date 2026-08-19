import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedMilestonePayout,
  findAdvancedUnfinishedPayout,
  fundingEscrowMatches,
} from './escrowProjection.js';
import { createMoneyMovement } from './model.js';

const buyer = '0x1111111111111111111111111111111111111111';
const seller = '0x2222222222222222222222222222222222222222';

test('matches every escrow funding invariant', () => {
  const account = {
    buyer,
    seller,
    dealAmount: 10_000_000n,
    milestonePcts: [40, 60],
  };
  assert.equal(
    fundingEscrowMatches(account, {
      buyerAgent: buyer.toUpperCase(),
      sellerAgent: seller,
      dealAmount: 10_000_000n,
      milestonePcts: [40, 60],
    }),
    true,
  );
  assert.equal(
    fundingEscrowMatches(account, {
      buyerAgent: buyer,
      sellerAgent: seller,
      dealAmount: 10_000_000n,
      milestonePcts: [60, 40],
    }),
    false,
  );
});

test('uses contract-identical milestone rounding and final remainder', () => {
  const account = { sellerNet: 9_999_999n, released: 0n, milestonePcts: [33, 33, 34] };
  const first = expectedMilestonePayout(account, 0);
  assert.equal(first, 3_299_999n);
  const secondReleased = first + expectedMilestonePayout({ ...account, released: first }, 1);
  assert.equal(
    expectedMilestonePayout({ ...account, released: secondReleased }, 2),
    account.sellerNet - secondReleased,
  );
});

test('reconciles an advanced unfinished payout before the next milestone', () => {
  const base = {
    operationKey: 'escrow_release:job:0',
    kind: 'milestone_payout' as const,
    amountMicros: 5_000_000n,
    initiatedBy: buyer,
    participants: [{ address: buyer, role: 'buyer' as const }],
    summary: 'Pay milestone 1',
    jobId: 'job',
    milestoneIndex: 0,
  };
  const first = createMoneyMovement('KWN-2345-6789-ABCD', base, 100);
  const next = createMoneyMovement(
    'KWN-EFGH-JKMN-PQRS',
    { ...base, operationKey: 'escrow_release:job:1', milestoneIndex: 1 },
    200,
  );
  assert.equal(findAdvancedUnfinishedPayout([next, first], 1)?.reference, first.reference);
  assert.equal(findAdvancedUnfinishedPayout([next, first], 0), undefined);
});
