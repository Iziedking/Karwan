import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { answersCancelHere, problemOptions, proposalOutcome, proposeKinds } from './problems';

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

test('money the seller never accepted on the escrow can be taken back by the buyer at any time', () => {
  assert.deepEqual(problemOptions(deal('awaiting-funding', { fundTxHash: '0xabc', escrowVersion: 'suite' }), 'buyer', NOW), ['cancel']);
  assert.deepEqual(problemOptions(deal('awaiting-funding', { fundTxHash: '0xabc', escrowVersion: 'v3' }), 'buyer', NOW), ['cancel']);
  assert.deepEqual(problemOptions(deal('awaiting-funding', { fundTxHash: '0xabc', escrowVersion: 'suite' }), 'seller', NOW), []);
});

test('during delivery the seller asks for time once; the buyer reclaims only after the grace period', () => {
  const later = Math.floor((NOW + 3 * DAY) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: later }), 'seller', NOW), ['moreTime']);
  // The route refuses a request on a deal with no date, so the page does not offer one.
  assert.deepEqual(problemOptions(deal('awaiting-delivery'), 'seller', NOW), []);
  const asked = deal('awaiting-delivery', { deadlineUnix: later, extensionRequest: { requestedBy: 'seller', requestedAt: NOW, additionalSeconds: 86_400 } });
  assert.deepEqual(problemOptions(asked, 'seller', NOW), []);
  const due = Math.floor((NOW - 2 * DAY) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: due }), 'buyer', NOW), ['reclaim']);
  const justDue = Math.floor((NOW - DAY / 2) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: justDue }), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('awaiting-delivery'), 'buyer', NOW), []);
});

test('after the date the seller asks once while the grace runs, and not after it', () => {
  const dueMs = NOW - DAY / 2;
  const due = Math.floor(dueMs / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: due }), 'seller', NOW), ['moreTime']);
  const declinedAfter = deal('awaiting-delivery', {
    deadlineUnix: due,
    extensionHistory: [{ requestedBy: 'seller', requestedAt: dueMs + 1000, additionalSeconds: 86_400, decidedAt: dueMs + 2000, decision: 'declined' }],
  });
  assert.deepEqual(problemOptions(declinedAfter, 'seller', NOW), []);
  const pastGrace = Math.floor((NOW - 2 * DAY) / 1000);
  assert.deepEqual(problemOptions(deal('awaiting-delivery', { deadlineUnix: pastGrace }), 'seller', NOW), []);
});

test('after delivery either side can dispute or propose cancelling, unless a proposal is open', () => {
  assert.deepEqual(problemOptions(deal('awaiting-first-release'), 'buyer', NOW), ['dispute', 'moreReview', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-final-release'), 'seller', NOW), ['dispute', 'propose']);
  assert.deepEqual(problemOptions(deal('disputed'), 'buyer', NOW), ['propose']);
  assert.deepEqual(problemOptions(deal('disputed'), 'seller', NOW), ['propose']);
  const proposed = deal('awaiting-first-release', { cancellationProposal: { proposedBy: 'seller', kind: 'mutual', reason: 'x', proposedAt: NOW } });
  assert.deepEqual(problemOptions(proposed, 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('settled'), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('awaiting-first-release'), null, NOW), []);
});

test('every proposal is answered on this page, saying where the money goes; older contracts finish in Earlier deals', () => {
  const proposal = (kind: NonNullable<DirectDeal['cancellationProposal']>['kind']) => ({ cancellationProposal: { proposedBy: 'seller' as const, kind, reason: 'x', proposedAt: NOW } });
  assert.equal(answersCancelHere(deal('awaiting-first-release', proposal('mutual'))), true);
  assert.equal(answersCancelHere(deal('disputed', proposal('release-from-dispute'))), true);
  assert.equal(answersCancelHere(deal('disputed', proposal('refund-from-dispute'))), true);
  assert.equal(answersCancelHere(deal('disputed', { ...proposal('refund-from-dispute'), legacyEscrow: true })), false);
  assert.equal(proposalOutcome(deal('awaiting-first-release', proposal('mutual'))), 'cancel');
  assert.equal(proposalOutcome(deal('awaiting-first-release', proposal('platform-attributed'))), 'cancel');
  assert.equal(proposalOutcome(deal('disputed', proposal('refund-from-dispute'))), 'refund');
  assert.equal(proposalOutcome(deal('disputed', proposal('release-from-dispute'))), 'pay');
  assert.equal(proposalOutcome(deal('disputed')), null);
});

test('in a dispute either side proposes refunding the buyer or paying the seller; before that, cancelling', () => {
  assert.deepEqual(proposeKinds(deal('disputed')), ['refund-from-dispute', 'release-from-dispute']);
  assert.deepEqual(proposeKinds(deal('awaiting-first-release')), ['mutual']);
});

test('a deal on an older contract offers no moves here', () => {
  assert.deepEqual(problemOptions(deal('awaiting-first-release', { legacyEscrow: true }), 'buyer', NOW), []);
  assert.deepEqual(problemOptions(deal('disputed', { legacyEscrow: true }), 'seller', NOW), []);
});

test('after a release the seller asks a quiet buyer to release once the grace has run, and the buyer answers while the window is open', () => {
  const HOUR = 3_600_000;
  const released = { delivered: true, reviewWindowStartedAt: NOW - 2 * HOUR, delayAppealGraceMs: HOUR, delayAppealResponseWindowMs: 5 * 60_000 };
  assert.deepEqual(problemOptions(deal('awaiting-final-release', released), 'seller', NOW), ['askRelease', 'dispute', 'propose']);
  // Not inside the grace, counted from the latest release.
  assert.deepEqual(problemOptions(deal('awaiting-final-release', { ...released, lastReleaseAt: NOW - HOUR / 2 }), 'seller', NOW), ['dispute', 'propose']);
  // Not before anything was released.
  assert.deepEqual(problemOptions(deal('awaiting-first-release', { delivered: true }), 'seller', NOW), ['dispute', 'propose']);
  const open = { ...released, delayAppealRaisedAt: NOW - 60_000 };
  assert.deepEqual(problemOptions(deal('awaiting-final-release', open), 'seller', NOW), ['dispute', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-final-release', open), 'buyer', NOW), ['answerAppeal', 'dispute', 'moreReview', 'propose']);
  // The window closed: the agent releases, nothing to answer.
  const late = { ...released, delayAppealRaisedAt: NOW - 10 * 60_000 };
  assert.deepEqual(problemOptions(deal('awaiting-final-release', late), 'buyer', NOW), ['dispute', 'moreReview', 'propose']);
  // Answered: the seller may ask again after a fresh grace, the buyer has nothing open.
  const answered = { ...released, delayAppealRaisedAt: NOW - 30 * 60_000, delayAppealRespondedAt: NOW - 20 * 60_000 };
  assert.deepEqual(problemOptions(deal('awaiting-final-release', answered), 'buyer', NOW), ['dispute', 'moreReview', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-final-release', answered), 'seller', NOW), ['askRelease', 'dispute', 'propose']);
});

test('while reviewing the buyer can ask once for more time, beside raising a problem', () => {
  assert.deepEqual(problemOptions(deal('awaiting-first-release', { delivered: true }), 'buyer', NOW), ['dispute', 'moreReview', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-final-release', { delivered: true, reviewExtensionCount: 1 }), 'buyer', NOW), ['dispute', 'propose']);
  assert.deepEqual(problemOptions(deal('awaiting-first-release', { delivered: true }), 'seller', NOW), ['dispute', 'propose']);
});
