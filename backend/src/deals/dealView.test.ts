import assert from 'node:assert/strict';
import test from 'node:test';
import { dealView, milestoneAmountUsdc, type DealViewInput } from './dealView.js';

const NOW = 1_790_000_000_000;
const base: DealViewInput = {
  buyer: '0x1111111111111111111111111111111111111111',
  seller: '0x2222222222222222222222222222222222222222',
  dealAmountUsdc: '1200',
  firstReleasePct: 50,
  createdAt: NOW - 10 * 86_400_000,
};
const funded: DealViewInput = {
  ...base,
  sellerApprovedAt: NOW - 9 * 86_400_000,
  acceptedAt: NOW - 8 * 86_400_000,
  onChain: { state: 2, milestonesReleased: 0, milestonePcts: [50, 50] },
};
const delivered: DealViewInput = { ...funded, delivered: true, deliveredAt: NOW - 86_400_000 };

test('milestone amounts use exact 6-decimal math', () => {
  assert.equal(milestoneAmountUsdc('1200', 50), '600');
  assert.equal(milestoneAmountUsdc('100.5', 33), '33.165');
  assert.equal(milestoneAmountUsdc('0.000001', 50), '0');
});

test('a fresh agreement waits on the seller to accept', () => {
  assert.deepEqual(dealView(base, 'seller', false, NOW).next, { action: 'accept', actor: 'you', amountUsdc: null });
  assert.deepEqual(dealView(base, 'buyer', false, NOW).next, { action: null, actor: 'counterparty', amountUsdc: null });
  assert.equal(dealView(base, 'buyer', false, NOW).money.line, 'not-funded');
  assert.equal(dealView(base, 'buyer', false, NOW).stage, 'awaiting-acceptance');
});

test('an accepted agreement waits on the buyer to fund the full amount', () => {
  const approved = { ...base, sellerApprovedAt: NOW - 86_400_000 };
  assert.deepEqual(dealView(approved, 'buyer', false, NOW).next, { action: 'fund', actor: 'you', amountUsdc: '1200' });
  assert.equal(dealView(approved, 'seller', false, NOW).next.actor, 'counterparty');
});

test('funded money reads as held; a pending movement reads as sending, never failed', () => {
  assert.equal(dealView(funded, 'buyer', false, NOW).money.line, 'held');
  assert.equal(dealView(funded, 'buyer', true, NOW).money.line, 'sending');
});

test('after delivery the buyer releases the first payment share', () => {
  const view = dealView(delivered, 'buyer', false, NOW);
  assert.equal(view.stage, 'awaiting-first-release');
  assert.deepEqual(view.next, { action: 'release', actor: 'you', amountUsdc: '600' });
  assert.deepEqual(dealView(delivered, 'seller', false, NOW).next, { action: null, actor: 'counterparty', amountUsdc: null });
});

test('a stalled delivery check offers the buyer manual review and pauses the money', () => {
  const stalled = { ...delivered, evidenceRequired: true, releaseBlockedReason: 'evidence-unavailable', evidenceManualReviewAvailable: true };
  const view = dealView(stalled, 'buyer', false, NOW);
  assert.equal(view.money.line, 'paused');
  assert.deepEqual(view.next, { action: 'review-manually', actor: 'you', amountUsdc: null });
});

test('a security hold pauses release with nobody able to act', () => {
  const held = { ...delivered, verificationStatus: 'suspicious' };
  assert.deepEqual(dealView(held, 'buyer', false, NOW).next, { action: null, actor: 'nobody', amountUsdc: null });
});

test('a requirement mismatch sends the seller to correct the delivery', () => {
  const mismatch = { ...delivered, releaseBlockedReason: 'requirement-mismatch' };
  assert.deepEqual(dealView(mismatch, 'seller', false, NOW).next, { action: 'deliver', actor: 'you', amountUsdc: null });
  assert.deepEqual(dealView(mismatch, 'buyer', false, NOW).next, { action: 'dispute', actor: 'you', amountUsdc: null });
});

test('a seller whose review window ended can claim the next share', () => {
  const eligible = { ...delivered, releaseEligibleAtMs: NOW - 1 };
  assert.deepEqual(dealView(eligible, 'seller', false, NOW).next, { action: 'claim', actor: 'you', amountUsdc: '600' });
});

test('the progress line marks done steps and the current one', () => {
  const view = dealView(delivered, 'buyer', false, NOW);
  assert.deepEqual(view.progress.map((p) => [p.step, p.state]), [
    ['agreed', 'done'], ['funded', 'done'], ['delivered', 'done'], ['checked', 'current'], ['released', 'upcoming'],
  ]);
  assert.equal(view.progress[2]?.at, delivered.deliveredAt);
});

test('manual review completes the checked step', () => {
  const reviewed = { ...delivered, evidenceRequired: true, evidenceManualReviewActive: true };
  assert.equal(dealView(reviewed, 'buyer', false, NOW).progress[3]?.state, 'done');
});

test('settled deals are released with nothing to do', () => {
  const settled = { ...delivered, settledAt: NOW - 1000, onChain: { state: 3, milestonesReleased: 2, milestonePcts: [50, 50] } };
  const view = dealView(settled, 'seller', false, NOW);
  assert.equal(view.stage, 'settled');
  assert.equal(view.money.line, 'released');
  assert.deepEqual(view.next, { action: null, actor: 'nobody', amountUsdc: null });
  assert.ok(view.progress.every((p) => p.state === 'done'));
});

test('a cancelled funded deal reads as refunding until the chain confirms the refund', () => {
  const cancelled = { ...funded, cancelledAt: NOW - 1000 };
  assert.equal(dealView(cancelled, 'buyer', false, NOW).money.line, 'refunding');
  assert.equal(dealView({ ...cancelled, onChain: { state: 5, milestonesReleased: 0, milestonePcts: [50, 50] } }, 'buyer', false, NOW).money.line, 'refunded');
  assert.equal(dealView({ ...base, cancelledAt: NOW }, 'buyer', false, NOW).money.line, 'not-funded');
});

test('pending proposals put the answer on the other party', () => {
  const proposal = { ...funded, cancellationProposal: { proposedBy: 'seller' as const } };
  assert.deepEqual(dealView(proposal, 'buyer', false, NOW).next, { action: 'respond-cancel', actor: 'you', amountUsdc: null });
  assert.deepEqual(dealView(proposal, 'seller', false, NOW).next, { action: null, actor: 'counterparty', amountUsdc: null });
  const extension = { ...funded, extensionRequest: { requestedBy: 'seller' as const } };
  assert.deepEqual(dealView(extension, 'buyer', false, NOW).next, { action: 'respond-extension', actor: 'you', amountUsdc: null });
});

test('automatic outcomes carry their dates', () => {
  const offer = { ...base, acceptanceDeadlineUnix: 1_790_100_000 };
  assert.deepEqual(dealView(offer, 'buyer', false, NOW).automatic, { kind: 'acceptance-expiry', at: 1_790_100_000_000 });
  const waitingDelivery = { ...funded, deadlineUnix: 1_790_200_000, deadlineReclaimGraceMs: 3_600_000 };
  assert.deepEqual(dealView(waitingDelivery, 'buyer', false, NOW).automatic, { kind: 'deadline-reclaim', at: 1_790_200_000_000 + 3_600_000 });
  const reviewing = { ...delivered, releaseEligibleAtMs: NOW + 5000 };
  assert.deepEqual(dealView(reviewing, 'buyer', false, NOW).automatic, { kind: 'auto-release', at: NOW + 5000 });
  assert.equal(dealView({ ...reviewing, releaseBlockedReason: 'security-hold' }, 'buyer', false, NOW).automatic, null);
});

test('checked step has a date when manual review completes', () => {
  const checkedAt = NOW - 2000;
  const reviewed = { ...delivered, evidenceRequired: true, evidenceManualReviewActive: true, checkedAt };
  assert.equal(dealView(reviewed, 'buyer', false, NOW).progress[3]?.at, checkedAt);
});

test('disputed deals read money line as paused even without explicit disputed flag', () => {
  const onChainDisputed = { ...funded, onChain: { state: 4, milestonesReleased: 0, milestonePcts: [50, 50] } };
  assert.equal(dealView(onChainDisputed, 'buyer', false, NOW).money.line, 'paused');
});

test('n-milestone deals progress through awaiting-first-release for multi-part deals', () => {
  const fivePart: DealViewInput = {
    ...base,
    dealAmountUsdc: '100',
    firstReleasePct: 20,
    sellerApprovedAt: NOW - 9 * 86_400_000,
    acceptedAt: NOW - 8 * 86_400_000,
    delivered: true,
    deliveredAt: NOW - 86_400_000,
    onChain: { state: 2, milestonesReleased: 1, milestonePcts: [20, 20, 20, 20, 20] },
  };
  const view1 = dealView(fivePart, 'buyer', false, NOW);
  assert.equal(view1.stage, 'awaiting-first-release');
  assert.equal(view1.next.amountUsdc, '20');
  const view4 = dealView({ ...fivePart, onChain: { state: 2, milestonesReleased: 4, milestonePcts: [20, 20, 20, 20, 20] } }, 'buyer', false, NOW);
  assert.equal(view4.stage, 'awaiting-final-release');
});
