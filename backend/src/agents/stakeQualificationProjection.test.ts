import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStakeQualificationObservation } from './stakeQualificationProjection.js';

test('trusted-match stake projection preserves the exact shortfall and non-executable policy', () => {
  const result = buildStakeQualificationObservation({
    dealRoomId: 'job-1',
    sellerAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    stakeOwner: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    fundingWallet: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    vaultAddress: '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    requiredStakeUsdc: '100',
    freeStakeUsdc: '25.5',
    reservationBps: 5000,
    observedAtUnix: 100,
  });

  assert.equal(result.requirement.requiredStakeUsdc, '100');
  assert.equal(result.snapshot.freeStakeUsdc, '25.5');
  assert.equal(result.policy.autonomousMaxUsdc, '0');
  assert.equal(result.blocker?.data.shortfallUsdc, '74.5');
  assert.equal(result.blocker?.data.mode, 'read-only-shadow');
});

test('stake projection refuses a non-shortfall observation', () => {
  assert.throws(
    () => buildStakeQualificationObservation({
      dealRoomId: 'job-2',
      sellerAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      stakeOwner: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      fundingWallet: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      vaultAddress: '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
      requiredStakeUsdc: '10',
      freeStakeUsdc: '10',
      reservationBps: 5000,
      observedAtUnix: 100,
    }),
    /shortfall projection/,
  );
});
