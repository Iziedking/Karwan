import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDealTerms,
  dealIdV3,
  dealTermsHash,
  DealTermsError,
  type DealTermsInput,
  type DealTermsLimits,
} from './dealTermsV3.js';

const DAY = 86_400;
const NOW = 1_800_000_000;
const SELLER = `0x${'33'.repeat(20)}` as const;
const AGREEMENT = `0x${'ab'.repeat(32)}` as const;

const LIMITS: DealTermsLimits = {
  nowSecs: NOW,
  minReviewSecs: 60,
  maxReviewSecs: 180 * DAY,
  maxHorizonSecs: 730 * DAY,
  highValueUnits: 0n,
  baseReviewSecs: 300,
  reclaimGraceSecs: DAY,
};

function input(over: Partial<DealTermsInput> = {}): DealTermsInput {
  return {
    seller: SELLER,
    amountUnits: 1_000_000_000n,
    milestonePcts: [50, 50],
    stakePct: null,
    deadlineUnix: NOW + 10 * DAY,
    reviewFloorSecs: 0,
    shape: 'service',
    agreementHash: AGREEMENT,
    ...over,
  };
}

// The same struct and expected hashes are pinned in
// contracts/test/DealTermsParity.t.sol, so the contract and the backend can
// never disagree on what the seller is asked to accept.
const PARITY_TERMS = {
  seller: SELLER,
  amount: 1_000_000_000n,
  pcts: [50, 30, 20, 0, 0] as [number, number, number, number, number],
  reservationBps: 7500,
  deliveryDeadline: 1_800_864_000n,
  reclaimGrace: 86_400,
  reviewWindow: 259_200,
  reviewStarts: 2,
  startLongstop: 604_800,
  maxExtensions: 1,
  extensionSecs: 259_200,
  finalRelease: 1,
  silenceOutcome: 0,
  silentLongstop: 1_123_200,
  checkPolicy: `0x${'cd'.repeat(32)}` as `0x${string}`,
  agreementHash: AGREEMENT,
};
const PARITY_TERMS_HASH = '0xce7c7e18a4e093c2cd817d364850a2655c63c90feb5babf8834bc09711f87300';
const PARITY_DEAL_ID = '0x3b69df8c396d46e181c51d86879f7788d787412d3a3b1c1dc93f4005036156df';

test('terms hash matches the contract for the same struct', () => {
  assert.equal(dealTermsHash(PARITY_TERMS), PARITY_TERMS_HASH);
});

test('deal id matches the contract formula: chain, escrow, buyer, salt', () => {
  const id = dealIdV3({
    chainId: 5042002,
    escrow: `0x${'11'.repeat(20)}`,
    buyer: `0x${'22'.repeat(20)}`,
    salt: `0x${'44'.repeat(32)}`,
  });
  assert.equal(id, PARITY_DEAL_ID);
});

test('a plain service deal: milestones padded to five, review on delivery, no stake', () => {
  const t = buildDealTerms(input(), LIMITS);
  assert.deepEqual(t.pcts, [50, 50, 0, 0, 0]);
  assert.equal(t.reservationBps, 0);
  assert.equal(t.reviewStarts, 0);
  assert.equal(t.startLongstop, 0);
  assert.equal(t.reviewWindow, 300);
  assert.equal(t.maxExtensions, 1);
  assert.equal(t.extensionSecs, 300);
  assert.equal(t.silentLongstop, 300 + 300 + 7 * DAY);
  assert.equal(t.finalRelease, 0);
  assert.equal(t.silenceOutcome, 0);
  assert.equal(t.deliveryDeadline, BigInt(NOW + 10 * DAY));
  assert.equal(t.reclaimGrace, DAY);
});

test('the stake slider maps to basis points', () => {
  assert.equal(buildDealTerms(input({ stakePct: 75 }), LIMITS).reservationBps, 7500);
});

test('a stake below half is refused before any money moves', () => {
  assert.throws(() => buildDealTerms(input({ stakePct: 40 }), LIMITS), DealTermsError);
});

test('goods start the review at arrival, with a 7-day longstop', () => {
  const t = buildDealTerms(input({ shape: 'goods' }), LIMITS);
  assert.equal(t.reviewStarts, 1);
  assert.equal(t.startLongstop, 7 * DAY);
});

test('a checked delivery starts the review at the check and carries its policy', () => {
  const policy = `0x${'cd'.repeat(32)}` as const;
  const t = buildDealTerms(input({ shape: 'checked', checkPolicy: policy }), LIMITS);
  assert.equal(t.reviewStarts, 2);
  assert.equal(t.checkPolicy, policy);
});

test('a checked delivery without a policy is refused', () => {
  assert.throws(() => buildDealTerms(input({ shape: 'checked' }), LIMITS), DealTermsError);
});

test('Net 30 carries its 30 days, and the window is clamped to the deployed limits', () => {
  assert.equal(buildDealTerms(input({ reviewFloorSecs: 30 * DAY }), LIMITS).reviewWindow, 30 * DAY);
  assert.equal(buildDealTerms(input({ reviewFloorSecs: 400 * DAY }), LIMITS).reviewWindow, 180 * DAY);
  const strict = { ...LIMITS, minReviewSecs: 3600 };
  assert.equal(buildDealTerms(input(), strict).reviewWindow, 3600);
});

test('at or above the high-value line the buyer must release the last milestone and a check is required', () => {
  const policy = `0x${'cd'.repeat(32)}` as const;
  const limits = { ...LIMITS, highValueUnits: 500_000_000n };
  const t = buildDealTerms(input({ shape: 'checked', checkPolicy: policy }), limits);
  assert.equal(t.finalRelease, 1);
  assert.throws(() => buildDealTerms(input(), limits), DealTermsError);
  assert.throws(
    () => buildDealTerms(input({ shape: 'checked', checkPolicy: policy, deadlineUnix: null }), limits),
    DealTermsError,
  );
});

test('a refundable deposit returns to the buyer on silence and needs a deadline', () => {
  const t = buildDealTerms(input({ refundableDeposit: true }), LIMITS);
  assert.equal(t.silenceOutcome, 1);
  assert.throws(
    () => buildDealTerms(input({ refundableDeposit: true, deadlineUnix: null }), LIMITS),
    DealTermsError,
  );
});

test('an open-ended deal has no deadline', () => {
  assert.equal(buildDealTerms(input({ deadlineUnix: null }), LIMITS).deliveryDeadline, 0n);
});

test('bad splits are refused: six parts, not summing to 100, a zero part', () => {
  for (const pcts of [[20, 20, 20, 20, 10, 10], [50, 40], [50, 0, 50], []]) {
    assert.throws(() => buildDealTerms(input({ milestonePcts: pcts }), LIMITS), DealTermsError, String(pcts));
  }
});

test('a deadline in the past or beyond the horizon is refused', () => {
  assert.throws(() => buildDealTerms(input({ deadlineUnix: NOW }), LIMITS), DealTermsError);
  assert.throws(() => buildDealTerms(input({ deadlineUnix: NOW + 731 * DAY }), LIMITS), DealTermsError);
});

test('a zero amount, a zero seller or a missing agreement digest is refused', () => {
  assert.throws(() => buildDealTerms(input({ amountUnits: 0n }), LIMITS), DealTermsError);
  assert.throws(
    () => buildDealTerms(input({ seller: `0x${'00'.repeat(20)}` }), LIMITS),
    DealTermsError,
  );
  assert.throws(
    () => buildDealTerms(input({ agreementHash: `0x${'00'.repeat(32)}` }), LIMITS),
    DealTermsError,
  );
});
