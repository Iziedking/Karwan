import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { answersCancelHere, problemOptions } from './problems';

const NOW = Date.UTC(2026, 9, 10);
const DAY = 86_400_000;

function deal(stage: string, extra: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xjob',
    buyer: '0x1',
    seller: '0x2',
    dealAmountUsdc: '100',
    firstReleasePct: 50,
    terms: 'Logo',
    delivered: false,
    createdAt: NOW - 5 * DAY,
    updatedAt: NOW,
    view: { stage, money: { line: 'held' }, progress: [], next: { action: null, actor: 'nobody', amountUsdc: null }, automatic: null },
    ...extra,
  } as DirectDeal;
}

test('before funding only the buyer can walk away, and only while nothing is held', () => {
  assert.deepEqual(problemOptions(deal('awaiting-acceptance'), 'buyer', NOW), ['cancel']);
  assert.deepEqual(problemOptions(deal('awaiting-funding'), 'seller', NOW), []);
  assert.deepEqual(problemOptions(deal('awaiting-funding', { fundTxHash: '0xabc' }), 'buyer', NOW), []);
});

test('during delivery the seller asks for time once; the buyer reclaims only after the grace period', () => {
  assert.deepEqual(problemOptions(deal('awaiting-delivery'), 'seller', NOW), ['moreTime']);
  const asked = deal('awaiting-delivery', { extensionRequest: { requestedBy: 'seller', requestedAt: NOW, additionalSeconds: 86_400 } });
  assert.deepEqual(problemOptions(asked, 'seller', NOW), []);
  const due = Math.floor((NOW - 2 * DAY) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: due }), 'buyer', NOW), ['reclaim']);
  const justDue = Math.floor((NOW - DAY / 2) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: justDue }), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('awaiting-delivery'), 'buyer', NOW), []);
});

test('after delivery either side can dispute or propose cancelling, unless a proposal is open', () => {
  assert.deepEqual(problemOptions(deal('awaiting-first-release'), 'buyer', NOW), ['dispute', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-final-release'), 'seller', NOW), ['dispute', 'propose']);
  const proposed = deal('awaiting-first-release', { cancellationProposal: { proposedBy: 'seller', kind: 'mutual', reason: 'x', proposedAt: NOW } });
  assert.deepEqual(problemOptions(proposed, 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('disputed'), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('settled'), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('awaiting-first-release'), null, NOW), []);
});

test('dispute rulings are answered on the full view, plain cancels here', () => {
  assert.equal(answersCancelHere(deal('awaiting-first-release', { cancellationProposal: { proposedBy: 'seller', kind: 'mutual', reason: 'x', proposedAt: NOW } })), true);
  assert.equal(answersCancelHere(deal('disputed', { cancellationProposal: { proposedBy: 'seller', kind: 'release-from-dispute', reason: 'x', proposedAt: NOW } })), false);
});
