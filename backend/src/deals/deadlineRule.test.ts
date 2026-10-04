import assert from 'node:assert/strict';
import test from 'node:test';
import { deadlineRuleAction } from './deadlineRule.js';

const DAY = 86_400_000;
const DEADLINE_S = 1_800_000_000;
const AT = DEADLINE_S * 1000 + DAY; // deadline plus grace
const base = { now: AT + 1, graceMs: DAY, statementWindowMs: 2 * DAY, sellerRespondedAfterDispute: false };

test('a delivery that still fails the check after the deadline is refunded', () => {
  const action = deadlineRuleAction({ deadlineUnix: DEADLINE_S, delivered: true, releaseBlockedReason: 'requirement-mismatch' }, base);
  assert.equal(action.kind, 'refund');
  assert.equal(action.kind === 'refund' && action.cause, 'failed-at-deadline');
});

test('nothing happens before the deadline and grace', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, releaseBlockedReason: 'requirement-mismatch' as const };
  assert.deepEqual(deadlineRuleAction(deal, { ...base, now: AT }), { kind: 'none' });
});

test('a redelivery that now passes the check is never refunded', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, deliveryMatch: { verdict: 'aligned' as const, reason: '' } };
  assert.deepEqual(deadlineRuleAction(deal, base), { kind: 'none' });
});

test('a partial verdict at the deadline goes to the arbiter for a partial payment', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, deliveryMatch: { verdict: 'partial' as const, reason: 'half' } };
  const action = deadlineRuleAction(deal, base);
  assert.equal(action.kind, 'arbiter');
});

test('a check that could not run is not a failure', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, releaseBlockedReason: 'evidence-unavailable' as const };
  assert.deepEqual(deadlineRuleAction(deal, base), { kind: 'none' });
});

test('no deadline means the deadline rule never fires', () => {
  const deal = { delivered: true, releaseBlockedReason: 'requirement-mismatch' as const };
  assert.deepEqual(deadlineRuleAction(deal, base), { kind: 'none' });
});

test('a seller silent for the statement window after a buyer dispute is refunded against', () => {
  const deal = { delivered: true, disputed: true, disputedBy: 'buyer' as const, disputedAt: 10 * DAY };
  const action = deadlineRuleAction(deal, { ...base, now: 12 * DAY + 1 });
  assert.equal(action.kind === 'refund' && action.cause, 'seller-silent');
});

test('a seller who replied in the window is not refunded against', () => {
  const deal = { delivered: true, disputed: true, disputedBy: 'buyer' as const, disputedAt: 10 * DAY };
  assert.deepEqual(deadlineRuleAction(deal, { ...base, now: 12 * DAY + 1, sellerRespondedAfterDispute: true }), { kind: 'none' });
});

test('a seller-opened dispute is left to the existing timer', () => {
  const deal = { delivered: true, disputed: true, disputedBy: 'seller' as const, disputedAt: 10 * DAY };
  assert.deepEqual(deadlineRuleAction(deal, { ...base, now: 30 * DAY }), { kind: 'none' });
});

test('a deal the rule already handled is never handled again', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, releaseBlockedReason: 'requirement-mismatch' as const, deadlineRuleAt: 1 };
  assert.deepEqual(deadlineRuleAction(deal, base), { kind: 'none' });
});

test('a disputed deal whose check failed is refunded at the deadline', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, disputed: true, disputedBy: 'buyer' as const, disputedAt: AT - DAY, releaseBlockedReason: 'requirement-mismatch' as const };
  const action = deadlineRuleAction(deal, { ...base, sellerRespondedAfterDispute: true });
  assert.equal(action.kind === 'refund' && action.cause, 'failed-at-deadline');
});

test('a redelivery newer than the failed check waits for its own check', () => {
  const deal = { deadlineUnix: DEADLINE_S, delivered: true, releaseBlockedReason: 'requirement-mismatch' as const, releaseBlockedAt: AT - 10, deliveredAt: AT - 5 };
  assert.deepEqual(deadlineRuleAction(deal, base), { kind: 'none' });
});
