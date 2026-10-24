import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGREEMENT_FUND_SIGNATURE,
  AgreementTermsError,
  agreementDealId,
  agreementTermsHash,
  agreementTermsTuple,
  buildAgreementTerms,
  buyerPaysMicros,
  type AgreementLimits,
  type AgreementTermsInput,
} from './agreementTerms.js';

const USDC = '0x3600000000000000000000000000000000000000';
const SELLER = '0x00000000000000000000000000000000000000bb';
const BUYER = '0x00000000000000000000000000000000000000aa';
const AGREEMENT = '0x55460D2b8b0D8067Ea33406b310224B5bd44F43C';
const VERIFIER = '0xCD395b291bcEcbFd58a3b8253C70510dd7bdAAa8';
const POLICY = `0x${'33'.repeat(32)}` as const;
const DAY = 86_400;

// Computed with cast abi-encode and cast keccak (Foundry v1.7.1) on 24 Oct 2026
// for the fixed one-time terms below and for the deal id formula of AgreementLib.
const PARITY_TERMS_HASH = '0x649794333239cafd51d73a9558c5c8b003225be7d57dcf98ff370f75c732ed13';
const PARITY_DEAL_ID = '0x1468b54eed51472f9a5d9e7c23ab8e6e76d03cdd89c8f595ea0e5cce197a3316';

const LIMITS: AgreementLimits = { minReview: 3_600, maxReview: 2_592_000, maxHorizon: 31_536_000, perDealCapMicros: 1_005_000_000n, feeBps: 100 };

const input = (over: Partial<AgreementTermsInput> = {}): AgreementTermsInput => ({
  kind: 'one_time',
  asset: USDC,
  seller: SELLER,
  amountMicros: 250_000_000n,
  acceptBy: 1_800_000_000n,
  deliveryDeadline: 1_800_604_800n,
  reviewWindowSecs: 3 * DAY,
  reclaimGraceSecs: DAY,
  agreementHash: `0x${'11'.repeat(32)}`,
  nowSecs: 1_799_990_000,
  ...over,
});

const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof AgreementTermsError, String(err));
    return err.code;
  }
  throw new Error('expected AgreementTermsError');
};

test('one_time_is_one_tranche_reviewed_on_delivery', () => {
  const t = buildAgreementTerms(input(), LIMITS);
  assert.deepEqual(t.trancheBps, [10_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(t.reviewStarts, 0);
  assert.equal(t.startLongstop, 0);
  assert.equal(t.silenceOutcome, 0);
  assert.equal(t.verifier, '0x0000000000000000000000000000000000000000');
});

test('milestones_split_evenly_with_the_remainder_on_the_last', () => {
  assert.deepEqual(buildAgreementTerms(input({ kind: 'milestones', stages: 3 }), LIMITS).trancheBps.slice(0, 4), [3333, 3333, 3334, 0]);
  assert.deepEqual(buildAgreementTerms(input({ kind: 'milestones', stages: 2 }), LIMITS).trancheBps.slice(0, 3), [5000, 5000, 0]);
});

test('refuses_more_than_five_stages', () => {
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones', stages: 6 }), LIMITS)), 'bad_stages');
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones', stages: 1 }), LIMITS)), 'bad_stages');
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones' }), LIMITS)), 'bad_stages');
});

test('goods_review_starts_at_arrival_with_a_longstop', () => {
  const t = buildAgreementTerms(input({ kind: 'goods' }), LIMITS);
  assert.equal(t.reviewStarts, 1);
  assert.ok(t.startLongstop > 0);
});

test('deposit_refunds_the_buyer_on_silence', () => {
  assert.equal(buildAgreementTerms(input({ kind: 'deposit' }), LIMITS).silenceOutcome, 1);
});

test('checked_deal_names_the_verifier_and_policy', () => {
  const t = buildAgreementTerms(input({ checked: { verifier: VERIFIER, checkPolicy: POLICY } }), LIMITS);
  assert.equal(t.reviewStarts, 2);
  assert.equal(t.verifier, VERIFIER);
  assert.equal(t.checkPolicy, POLICY);
  assert.ok(t.startLongstop > 0);
});

test('refuses_over_the_cap_with_the_buyer_half_fee', () => {
  assert.equal(buyerPaysMicros(1_000_000_000n, 100), 1_005_000_000n);
  assert.equal(buyerPaysMicros(1_001_000_000n, 100), 1_006_005_000n);
  assert.equal(buyerPaysMicros(333n, 100), 334n, 'the fee is floored, then halved down');
  buildAgreementTerms(input({ amountMicros: 1_000_000_000n }), LIMITS);
  assert.equal(code(() => buildAgreementTerms(input({ amountMicros: 1_001_000_000n }), LIMITS)), 'over_cap');
});

test('silent_longstop_covers_the_start_longstop_and_review', () => {
  for (const kind of ['one_time', 'goods'] as const) {
    const t = buildAgreementTerms(input({ kind }), LIMITS);
    assert.ok(t.silentLongstop >= t.startLongstop + t.reviewWindow + t.maxExtensions * t.extensionSecs, kind);
    assert.ok(t.extensionSecs <= t.reviewWindow);
  }
});

test('refuses_a_review_outside_the_bounds', () => {
  assert.equal(code(() => buildAgreementTerms(input({ reviewWindowSecs: 3_599 }), LIMITS)), 'bad_review');
  assert.equal(code(() => buildAgreementTerms(input({ reviewWindowSecs: 2_592_001 }), LIMITS)), 'bad_review');
  assert.equal(code(() => buildAgreementTerms(input({ reclaimGraceSecs: 2_592_001 }), LIMITS)), 'bad_review');
});

test('refuses_dates_the_escrow_would_refuse', () => {
  assert.equal(code(() => buildAgreementTerms(input({ acceptBy: 1_799_990_000n }), LIMITS)), 'bad_horizon', 'accept-by in the past');
  assert.equal(code(() => buildAgreementTerms(input({ deliveryDeadline: 1_800_000_000n }), LIMITS)), 'bad_horizon', 'deadline not after accept-by');
  assert.equal(code(() => buildAgreementTerms(input({ deliveryDeadline: 1_799_990_000n + 31_536_001n }), LIMITS)), 'bad_horizon');
});

test('terms_hash_is_keccak_of_the_encoded_tuple', () => {
  assert.equal(agreementTermsHash(buildAgreementTerms(input(), LIMITS)), PARITY_TERMS_HASH);
});

test('deal_id_matches_the_contract_formula', () => {
  assert.equal(agreementDealId({ chainId: 5042002, escrow: AGREEMENT, buyer: BUYER, salt: `0x${'22'.repeat(32)}` }), PARITY_DEAL_ID);
});

test('the_circle_tuple_has_the_24_fields_in_order_as_strings', () => {
  const t = buildAgreementTerms(input({ kind: 'milestones', stages: 2 }), LIMITS);
  const tuple = agreementTermsTuple(t);
  assert.equal(tuple.length, 24);
  assert.equal(tuple[2], '250000000');
  assert.deepEqual(tuple[3], ['5000', '5000', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0']);
  assert.equal(AGREEMENT_FUND_SIGNATURE.split(',').length, 25, 'the salt and 24 term fields');
});

test('milestones_keep_the_split_the_parties_agreed', () => {
  assert.deepEqual(buildAgreementTerms(input({ kind: 'milestones', milestonePcts: [40, 60] }), LIMITS).trancheBps.slice(0, 3), [4000, 6000, 0]);
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones', milestonePcts: [40, 50] }), LIMITS)), 'bad_stages', 'must add up to 100');
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones', milestonePcts: [20, 20, 20, 20, 10, 10] }), LIMITS)), 'bad_stages');
  assert.equal(code(() => buildAgreementTerms(input({ kind: 'milestones', milestonePcts: [100] }), LIMITS)), 'bad_stages');
});
