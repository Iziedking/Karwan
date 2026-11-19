import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import type { MoneyMovement } from '../money/model.js';
import { buildDealRecord, dealRecordDigest, type DealEvent } from './dealRecord.js';

/// The deal record (view 94): what was agreed, the money held, how each stage
/// was confirmed, the release, all from what the deal already stored.
///
///   npx tsx --test src/deals/dealRecord.test.ts

const JOB = '0xd68fe7d8aaaabbbbccccddddeeeeffff00001111222233334444555566667777';
const T = 1_763_500_000_000;

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({
    jobId: JOB,
    buyer: '0xbuyer',
    seller: '0xseller',
    dealAmountUsdc: '100',
    firstReleasePct: 100,
    terms: 'A navy suit, made to measure\nDelivered to Wuse 2',
    createdAt: T,
    delivered: true,
    ...over,
  }) as DirectDeal;

const movement = (over: Partial<MoneyMovement>): MoneyMovement =>
  ({
    reference: 'KWN-AAAA-BBBB-CCCC',
    operationKey: 'k',
    kind: 'milestone_payout',
    state: 'completed',
    version: 1,
    attempt: 1,
    currency: 'USDC',
    amountMicros: '0',
    initiatedBy: '0xbuyer',
    participants: [],
    summary: '',
    nextActor: 'none',
    jobId: JOB,
    legs: [],
    createdAt: T,
    updatedAt: T,
    completedAt: T,
    ...over,
  }) as MoneyMovement;

const leg = (txHash: string) => [{ id: 'l', key: 'k', attempt: 1, label: 'x', rail: 'arc_contract', state: 'verified', idempotencyKey: 'i', txHash, createdAt: T }] as MoneyMovement['legs'];

const released = (i: number, ts: number, extra: Record<string, unknown> = {}, actor = 'buyer'): DealEvent => ({
  type: 'escrow.milestone.released',
  ts,
  actor,
  payload: { milestoneIndex: i, ...extra },
});

test('a deal that has not ended has no record', () => {
  assert.equal(buildDealRecord(deal(), [], []), null);
});

test('a deal with nothing but a settled time reads "not recorded" everywhere and does not throw', () => {
  const r = buildDealRecord(deal({ settledAt: T + 5 }), [], [])!;
  assert.equal(r.ended, 'settled');
  assert.equal(r.endedAt, T + 5);
  assert.equal(r.reference, 'D68F-E7D8');
  assert.deepEqual(r.agreed, { digest: null, buyerAt: null, sellerAt: null, title: 'A navy suit, made to measure', priceUsdc: '100' });
  assert.equal(r.held, null);
  assert.equal(r.stages.length, 1);
  assert.deepEqual(r.stages[0], { index: 0, confirmed: { way: 'not_recorded', at: null }, released: null });
});

test('agreed and held come from the approved digest, the funding event and the funding movement', () => {
  const r = buildDealRecord(
    deal({ settledAt: T + 9, sellerApprovedAgreementDigest: '0xagree', sellerApprovedTermsDigest: '0xterms', sellerApprovedAt: T + 1, acceptedAt: T + 2 }),
    [movement({ kind: 'escrow_funding', amountMicros: '100000000', completedAt: T + 3, reference: 'KWN-FUND', legs: leg('0xfundtx') })],
    [{ type: 'escrow.funded', ts: T + 3 }],
  )!;
  assert.deepEqual(r.agreed, { digest: '0xagree', buyerAt: T + 3, sellerAt: T + 1, title: 'A navy suit, made to measure', priceUsdc: '100' });
  assert.deepEqual(r.held, { usdc: '100', at: T + 3, tx: '0xfundtx', reference: 'KWN-FUND' });
});

test('with no digest of the agreement the terms digest is used; with no movement the funding hash is used', () => {
  const r = buildDealRecord(deal({ settledAt: T + 9, sellerApprovedTermsDigest: '0xterms', acceptedAt: T + 2, fundTxHash: '0xold' }), [], [])!;
  assert.equal(r.agreed.digest, '0xterms');
  assert.equal(r.agreed.sellerAt, T + 2);
  assert.deepEqual(r.held, { usdc: '100', at: null, tx: '0xold', reference: null });
});

test('a buyer who released the money confirmed the work; the payout movement gives the amounts and the fee', () => {
  const r = buildDealRecord(
    deal({ settledAt: T + 9 }),
    [movement({ kind: 'milestone_payout', milestoneIndex: 0, amountMicros: '98000000', completedAt: T + 8, reference: 'KWN-PAY', legs: leg('0xpaytx') })],
    [released(0, T + 8)],
  )!;
  assert.deepEqual(r.stages[0], {
    index: 0,
    confirmed: { way: 'buyer_confirmed', at: T + 8 },
    released: { sellerUsdc: '98', refundUsdc: '0', feeUsdc: '2', at: T + 8, tx: '0xpaytx', reference: 'KWN-PAY' },
  });
});

test('with no payout movement the release event carries the transaction and the amount, and the fee is unknown', () => {
  const suite = buildDealRecord(deal({ settledAt: T + 9 }), [], [released(0, T + 8, { txHash: '0xev', sellerMicros: '97500000' })])!;
  assert.deepEqual(suite.stages[0]!.released, { sellerUsdc: '97.5', refundUsdc: '0', feeUsdc: '2.5', at: T + 8, tx: '0xev', reference: null });
  const backfill = buildDealRecord(deal({ settledAt: T + 9 }), [], [released(0, T + 8, { amountUsdc: '98' })])!;
  assert.deepEqual(backfill.stages[0]!.released, { sellerUsdc: '98', refundUsdc: '0', feeUsdc: '2', at: T + 8, tx: null, reference: null });
  const bare = buildDealRecord(deal({ settledAt: T + 9 }), [], [released(0, T + 8)])!;
  assert.deepEqual(bare.stages[0]!.released, { sellerUsdc: null, refundUsdc: '0', feeUsdc: null, at: T + 8, tx: null, reference: null });
});

test('three stages: the timer paid the first, the seller claimed the second, the buyer released the last', () => {
  const r = buildDealRecord(
    deal({ settledAt: T + 30, firstReleasePct: 30, milestonePcts: [30, 30, 40] }),
    [],
    [
      { type: 'deal.milestone.auto_released', ts: T + 10, actor: 'buyer', payload: { index: 0 } },
      released(0, T + 10),
      released(1, T + 20, { byClaim: true }, 'seller'),
      released(2, T + 30),
    ],
  )!;
  assert.deepEqual(r.stages.map((s) => s.confirmed.way), ['review_window', 'review_window', 'buyer_confirmed']);
  assert.deepEqual(r.stages.map((s) => s.index), [0, 1, 2]);
});

test('a seller claim after asking the buyer is the buyer not answering', () => {
  const silence = buildDealRecord(
    deal({ settledAt: T + 20, buyerSilence: { revision: 1, paid: 0, promptedAt: T + 5, raisedAt: T + 6, raisedBy: 'seller' } } as Partial<DirectDeal>),
    [],
    [released(0, T + 20, { byClaim: true }, 'seller')],
  )!;
  assert.deepEqual(silence.stages[0]!.confirmed, { way: 'buyer_silent', at: T + 20 });
});

test('the last stage released after a delay appeal went unanswered is the buyer not answering', () => {
  const r = buildDealRecord(
    deal({ settledAt: T + 40, firstReleasePct: 50, delayAppealRaisedAt: T + 20, autoReleasedAt: T + 40 }),
    [],
    [released(0, T + 10), released(1, T + 40)],
  )!;
  assert.deepEqual(r.stages.map((s) => s.confirmed.way), ['buyer_confirmed', 'buyer_silent']);
  assert.equal(r.stages[1]!.confirmed.at, T + 40);
});

test('goods handed over in person: the code the seller entered confirmed it', () => {
  const r = buildDealRecord(
    deal({ settledAt: T + 9, handover: { codeHash: 'h', issuedAt: T + 1, attempts: 1, usedAt: T + 7 } }),
    [],
    [released(0, T + 8)],
  )!;
  assert.deepEqual(r.stages[0]!.confirmed, { way: 'handover_code', at: T + 7 });
});

test('a dispute decides every stage released after it opened, and says who decided', () => {
  const panel = buildDealRecord(
    deal({ settledAt: T + 50, firstReleasePct: 50, disputed: true, disputedAt: T + 15, disputeReferredAt: T + 30, cancelKind: 'release-from-dispute' }),
    [],
    [released(0, T + 10), released(1, T + 50), { type: 'escrow.resolved', ts: T + 50 }],
  )!;
  assert.deepEqual(panel.stages[0]!.confirmed, { way: 'buyer_confirmed', at: T + 10 });
  assert.deepEqual(panel.stages[1]!.confirmed, { way: 'dispute', at: T + 50, decidedBy: 'panel' });
  assert.equal(panel.ended, 'resolved');

  const finding = buildDealRecord(
    deal({ settledAt: T + 50, disputed: true, disputedAt: T + 5, judgeProposal: { reviewedBy: '0xreviewer' } as DirectDeal['judgeProposal'], cancelKind: 'release-from-dispute' }),
    [],
    [released(0, T + 50)],
  )!;
  assert.equal(finding.stages[0]!.confirmed.decidedBy, 'finding');

  const arbiter = buildDealRecord(deal({ settledAt: T + 50, disputed: true, disputedAt: T + 5, cancelKind: 'resolved' }), [], [released(0, T + 50)])!;
  assert.equal(arbiter.stages[0]!.confirmed.decidedBy, 'arbiter');
});

test('a refund after a dispute reads as decided in a dispute, not refunded', () => {
  const r = buildDealRecord(
    deal({ cancelledAt: T + 40, disputed: true, disputedAt: T + 10, cancelKind: 'refund-from-dispute', refundTxHash: '0xrefund' }),
    [movement({ kind: 'escrow_refund', amountMicros: '100000000', completedAt: T + 40, reference: 'KWN-REF', legs: leg('0xrefundleg') })],
    [],
  )!;
  assert.equal(r.ended, 'refunded');
  assert.equal(r.stages.length, 1);
  assert.deepEqual(r.stages[0], {
    index: 0,
    confirmed: { way: 'dispute', at: T + 40, decidedBy: 'agreed' },
    released: { sellerUsdc: '0', refundUsdc: '100', feeUsdc: '0', at: T + 40, tx: '0xrefundleg', reference: 'KWN-REF' },
  });
});

test('cancelled by both, and any other refund with its reason', () => {
  const mutual = buildDealRecord(deal({ cancelledAt: T + 4, cancelKind: 'mutual', cancelReason: 'Changed plans', refundTxHash: '0xr' }), [], [])!;
  assert.equal(mutual.ended, 'cancelled');
  assert.deepEqual(mutual.stages[0]!.confirmed, { way: 'cancelled_by_both', at: T + 4 });
  assert.deepEqual(mutual.stages[0]!.released, { sellerUsdc: '0', refundUsdc: '100', feeUsdc: '0', at: T + 4, tx: '0xr', reference: null });

  const late = buildDealRecord(deal({ cancelledAt: T + 4, cancelKind: 'unilateral', cancelReason: 'Not delivered by the date' }), [], [])!;
  assert.deepEqual(late.stages[0]!.confirmed, { way: 'refunded', at: T + 4, reason: 'Not delivered by the date' });
});

test('a refund after a paid first stage keeps the paid stage and adds the refund after it', () => {
  const r = buildDealRecord(
    deal({ cancelledAt: T + 40, firstReleasePct: 30, cancelKind: 'unilateral' }),
    [movement({ kind: 'escrow_refund', amountMicros: '70000000', completedAt: T + 40, reference: 'KWN-R', legs: leg('0xr') })],
    [released(0, T + 10, { amountUsdc: '29.4' })],
  )!;
  assert.deepEqual(r.stages.map((s) => [s.index, s.confirmed.way]), [[0, 'buyer_confirmed'], [1, 'refunded']]);
  assert.equal(r.stages[1]!.released!.refundUsdc, '70');
});

test('the digest is the same whatever order the keys were written in, and changes with any fact', () => {
  const a = buildDealRecord(deal({ settledAt: T + 9 }), [], [released(0, T + 8)])!;
  const reordered = JSON.parse(JSON.stringify(a, Object.keys(a).reverse()));
  assert.equal(dealRecordDigest(a), dealRecordDigest({ ...reordered, ...a }));
  assert.match(dealRecordDigest(a), /^0x[0-9a-f]{64}$/);
  assert.notEqual(dealRecordDigest(a), dealRecordDigest({ ...a, endedAt: a.endedAt + 1 }));
});
