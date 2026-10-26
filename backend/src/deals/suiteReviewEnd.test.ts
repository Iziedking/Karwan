import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';
import { REMIND_BEFORE_MS, reviewEndStep, runSuiteReviewEnd, type SuiteReviewEndDeps } from './suiteReviewEnd.js';

type Hex = `0x${string}`;
const NOW = 1_800_000_000_000;
const SECS = (ms: number) => BigInt(Math.floor(ms / 1000));
const Z20 = `0x${'00'.repeat(20)}` as Hex;

const view = (over: Partial<DealV3View> = {}): DealV3View => ({
  state: DEAL_STATE.Accepted, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 2, paid: 0, extUsed: 0, revision: 1,
  checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: SECS(NOW - 4 * 86_400_000), reviewStartAt: 0n,
  reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
  feeReleased: 0n, reserved: 0n, termsHash: `0x${'00'.repeat(32)}`, ...over,
});

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({ jobId: 'deal-1', buyer: '0xbuyer', seller: '0xseller', escrowVersion: 'suite', escrowDealId: `0x${'aa'.repeat(32)}`, sellerAgentWalletId: 'seller-w', delivered: true, ...over }) as DirectDeal;

const step = (over: { deal?: DirectDeal; view?: DealV3View; endMs: number | null }) =>
  reviewEndStep({ deal: over.deal ?? deal(), view: over.view ?? view(), reviewEndSecs: over.endMs === null ? 0n : SECS(over.endMs), nowMs: NOW });

test('waits_before_the_last_day', () => {
  assert.equal(step({ endMs: NOW + REMIND_BEFORE_MS + 60_000 }), 'wait');
});

test('reminds_once_in_the_last_day', () => {
  const endMs = NOW + 3_600_000;
  assert.equal(step({ endMs }), 'remind');
  const reminded = deal({ reviewReminder: { revision: 1, paid: 0, endSecs: Number(SECS(endMs)) } });
  assert.equal(step({ deal: reminded, endMs }), 'wait');
});

test('claims_when_review_ends', () => {
  assert.equal(step({ endMs: NOW - 1_000 }), 'claim');
  assert.equal(step({ endMs: NOW }), 'claim');
});

test('more_time_moves_the_end', () => {
  const reminded = deal({ reviewReminder: { revision: 1, paid: 0, endSecs: Number(SECS(NOW - 1_000)) } });
  const laterEnd = NOW + 2 * 86_400_000;
  assert.equal(step({ deal: reminded, endMs: laterEnd }), 'wait');
  assert.equal(step({ deal: reminded, endMs: NOW + 3_600_000 }), 'remind', 'the new end gets its own reminder');
});

test('never_claims_a_deposit', () => {
  const deposit = deal({ escrowTerms: { silenceOutcome: 1 } as DirectDeal['escrowTerms'] });
  assert.equal(step({ deal: deposit, endMs: NOW - 1_000 }), 'wait');
  assert.equal(step({ deal: deposit, endMs: NOW + 3_600_000 }), 'wait');
});

test('waits_while_disputed_or_not_open', () => {
  assert.equal(step({ deal: deal({ disputed: true }), endMs: NOW - 1_000 }), 'wait');
  assert.equal(step({ view: view({ state: DEAL_STATE.Disputed }), endMs: NOW - 1_000 }), 'wait');
  assert.equal(step({ view: view({ deliveredAt: 0n }), endMs: NOW - 1_000 }), 'wait');
  assert.equal(step({ deal: deal({ escrowVersion: 'v3' }), endMs: NOW - 1_000 }), 'wait');
  assert.equal(step({ deal: deal({ v3CheckFailedRevision: 1 }), endMs: NOW - 1_000 }), 'wait', 'a failed check is the buyer\'s case');
});

test('waits_until_review_starts', () => {
  assert.equal(step({ endMs: null }), 'wait');
});

function world(opts: { claimFails?: boolean; endMs: number }) {
  const calls: string[] = [];
  const patches: Array<Partial<DirectDeal>> = [];
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const deps: SuiteReviewEndDeps = {
    readView: async () => view(),
    readReviewEnd: async () => SECS(opts.endMs),
    claim: async (_d, index) => {
      calls.push(`claim:${index}`);
      if (opts.claimFails) throw new Error('execution reverted: Early');
      return '0xtx';
    },
    recordSettlement: async () => {
      calls.push('settle');
    },
    patchDeal: async (_id, patch) => {
      patches.push(patch);
    },
    emit: (e) => events.push(e),
  };
  return { deps, calls, patches, events };
}

test('a_reminder_names_the_three_choices_and_is_saved', async () => {
  const endMs = NOW + 3_600_000;
  const w = world({ endMs });
  assert.equal(await runSuiteReviewEnd(w.deps, deal(), NOW), 'remind');
  assert.equal(w.events[0]!.type, 'deal.review.ending');
  assert.equal(w.events[0]!.payload.endsAt, Number(SECS(endMs)) * 1000);
  assert.deepEqual(w.patches[0]!.reviewReminder, { revision: 1, paid: 0, endSecs: Number(SECS(endMs)) });
  assert.deepEqual(w.calls, []);
});

test('the_seller_is_paid_when_review_ends', async () => {
  const w = world({ endMs: NOW - 1_000 });
  assert.equal(await runSuiteReviewEnd(w.deps, deal(), NOW), 'claim');
  assert.deepEqual(w.calls, ['claim:0', 'settle']);
});

test('claim_failure_is_retried_not_recorded', async () => {
  const w = world({ endMs: NOW - 1_000, claimFails: true });
  await assert.rejects(runSuiteReviewEnd(w.deps, deal(), NOW), /Early/);
  assert.deepEqual(w.calls, ['claim:0']);
  assert.equal(w.patches.length, 1, 'only the retry time is saved, never a payout');
  assert.equal(w.patches[0]!.settledAt, undefined);
});

test('a_failed_claim_waits_before_trying_again', async () => {
  const w = world({ endMs: NOW - 1_000, claimFails: true });
  await assert.rejects(runSuiteReviewEnd(w.deps, deal(), NOW), /Early/);
  const retryAt = w.patches[0]!.reviewClaimRetryAt!;
  assert.ok(retryAt >= NOW + 15 * 60_000, 'one failed claim is not resent every tick');
  assert.equal(step({ deal: deal({ reviewClaimRetryAt: retryAt }), endMs: NOW - 1_000 }), 'wait');
  assert.equal(reviewEndStep({ deal: deal({ reviewClaimRetryAt: retryAt }), view: view(), reviewEndSecs: SECS(NOW - 1_000), nowMs: retryAt }), 'claim');
});
