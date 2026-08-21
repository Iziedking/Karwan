import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expectedMilestonePayout,
  findAdvancedUnfinishedPayout,
  fundingEscrowMatches,
  milestonePayoutSchedule,
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

test('the payout schedule sums to sellerNet and leaves no dust on the last milestone', () => {
  // 33/33/34 of a figure that does not divide: the contract floors each
  // percentage cut and sweeps the remainder on the final milestone, so a
  // schedule that merely applied the percentages would strand micros.
  const account = { sellerNet: 9_999_999n, milestonePcts: [33, 33, 34] };
  const schedule = milestonePayoutSchedule(account);
  assert.deepEqual(schedule, [3_299_999n, 3_299_999n, 3_400_001n]);
  assert.equal(
    schedule.reduce((total, amount) => total + amount, 0n),
    account.sellerNet,
  );
});

test('the payout schedule reads a settled escrow the live projection cannot', () => {
  // A settled escrow has released == sellerNet, which makes the live projection
  // report the final milestone as zero. This is why receipts written after the
  // fact use the schedule instead.
  const account = { sellerNet: 4_000_000n, milestonePcts: [40, 60] };
  assert.equal(expectedMilestonePayout({ ...account, released: account.sellerNet }, 1), 0n);
  assert.deepEqual(milestonePayoutSchedule(account), [1_600_000n, 2_400_000n]);
});

test('a single-milestone escrow pays the whole seller net at once', () => {
  assert.deepEqual(
    milestonePayoutSchedule({ sellerNet: 12_400_000n, milestonePcts: [100] }),
    [12_400_000n],
  );
});
