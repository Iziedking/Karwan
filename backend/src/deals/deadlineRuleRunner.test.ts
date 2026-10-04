import assert from 'node:assert/strict';
import test from 'node:test';
import { runDeadlineRule, STATE, type DeadlineRuleDeps } from './deadlineRuleRunner.js';
import type { DirectDeal } from '../db/deals.js';

const DAY = 86_400_000;
const settings = { graceMs: DAY, statementWindowMs: 2 * DAY };
const failed = { jobId: '0x1', buyer: '0xb', seller: '0xs', delivered: true, deadlineUnix: 1_000, releaseBlockedReason: 'requirement-mismatch', buyerAgentWalletId: 'w1' } as unknown as DirectDeal;
const later = 1_000 * 1000 + 2 * DAY;

function deps(state: number, calls: string[]): DeadlineRuleDeps {
  return {
    readState: async () => state,
    openDispute: async () => { calls.push('dispute'); return '0xd'; },
    resolveRefund: async () => { calls.push('resolve'); return '0xr'; },
    patchDeal: async (_id, patch) => { calls.push(`patch:${Object.keys(patch).sort().join(',')}`); },
    emit: (e) => { calls.push(`emit:${e.type}`); },
    sellerRespondedAfterDispute: async () => false,
  };
}

test('a failed check past the deadline opens a dispute, refunds and records it once', async () => {
  const calls: string[] = [];
  assert.equal(await runDeadlineRule(failed, later, deps(STATE.accepted, calls), settings), 'refunded');
  assert.equal(calls[0], 'dispute');
  assert.ok(calls.indexOf('dispute') < calls.indexOf('resolve'), 'the dispute opens before the resolve');
  assert.ok(calls.some((c) => c.startsWith('patch:') && c.includes('deadlineRuleAt') && c.includes('settledAt')));
  assert.ok(calls.includes('emit:deal.dispute.auto_resolved'));
});

test('an escrow already disputed is resolved without opening a second dispute', async () => {
  const calls: string[] = [];
  await runDeadlineRule({ ...failed, disputed: true, disputedBy: 'buyer', disputedAt: later - DAY } as DirectDeal, later, deps(STATE.disputed, calls), settings);
  assert.equal(calls[0], 'resolve');
  assert.ok(!calls.includes('dispute'));
});

test('an escrow no longer accepted or disputed is left alone', async () => {
  const calls: string[] = [];
  assert.equal(await runDeadlineRule(failed, later, deps(99, calls), settings), 'none');
  assert.deepEqual(calls, []);
});

test('without a buyer agent wallet the rule flags the arbiter instead of throwing', async () => {
  const calls: string[] = [];
  assert.equal(await runDeadlineRule({ ...failed, buyerAgentWalletId: undefined } as DirectDeal, later, deps(STATE.accepted, calls), settings), 'blocked');
  assert.ok(calls.includes('emit:deal.dispute.needs_arbiter'));
  assert.ok(!calls.includes('resolve'));
});

test('a partial verdict opens the dispute and flags the arbiter, with no ruling', async () => {
  const calls: string[] = [];
  const partial = { ...failed, releaseBlockedReason: undefined, deliveryMatch: { verdict: 'partial', reason: 'half' } } as unknown as DirectDeal;
  assert.equal(await runDeadlineRule(partial, later, deps(STATE.accepted, calls), settings), 'escalated');
  assert.deepEqual(calls.filter((c) => c === 'dispute' || c === 'resolve'), ['dispute']);
  assert.ok(calls.includes('emit:deal.dispute.needs_arbiter'));
});

test('nothing to do means nothing is read or signed', async () => {
  const calls: string[] = [];
  const fine = { ...failed, releaseBlockedReason: undefined } as DirectDeal;
  assert.equal(await runDeadlineRule(fine, later, deps(STATE.accepted, calls), settings), 'none');
  assert.deepEqual(calls, []);
});
