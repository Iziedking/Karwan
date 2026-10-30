import assert from 'node:assert/strict';
import test from 'node:test';
import { dealView, holdOf, milestoneAmountUsdc, type DealViewInput } from './dealView.js';

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

test('after a milestone is paid, the next one waits for its own delivery before the buyer can release', () => {
  const paidOne: DealViewInput = { ...delivered, onChain: { state: 2, milestonesReleased: 1, milestonePcts: [50, 50] }, awaitingNextDelivery: true };
  const view = dealView(paidOne, 'buyer', false, NOW);
  assert.equal(view.stage, 'awaiting-delivery');
  assert.deepEqual(view.next, { action: null, actor: 'counterparty', amountUsdc: null });
  assert.deepEqual(dealView(paidOne, 'seller', false, NOW).next, { action: 'deliver', actor: 'you', amountUsdc: null });
  assert.equal(view.progress.find((p) => p.step === 'delivered')?.state, 'current');
  // Once the seller delivers milestone 2, the buyer releases it.
  const deliveredTwo = { ...paidOne, awaitingNextDelivery: false };
  assert.equal(dealView(deliveredTwo, 'buyer', false, NOW).stage, 'awaiting-final-release');
  assert.deepEqual(dealView(deliveredTwo, 'buyer', false, NOW).next, { action: 'release', actor: 'you', amountUsdc: '600' });
});

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

test('a turned-down agreement moves to the buyer and the seller waits for new terms', () => {
  const declined = { ...base, sellerDeclinedAt: NOW - 3_600_000 };
  assert.deepEqual(dealView(declined, 'buyer', false, NOW).next, { action: null, actor: 'you', amountUsdc: null });
  assert.deepEqual(dealView(declined, 'seller', false, NOW).next, { action: null, actor: 'counterparty', amountUsdc: null });
  assert.equal(dealView(declined, 'buyer', false, NOW).money.line, 'not-funded');
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

test('a held link pauses release and the seller moves next: another link, or a person checks it (view 21)', () => {
  const held = { ...delivered, verificationStatus: 'suspicious' };
  assert.equal(dealView(held, 'buyer', false, NOW).money.line, 'paused');
  assert.deepEqual(dealView(held, 'buyer', false, NOW).next, { action: null, actor: 'counterparty', amountUsdc: null });
  assert.deepEqual(dealView(held, 'seller', false, NOW).next, { action: 'deliver', actor: 'you', amountUsdc: null });
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
  assert.equal(dealView({ ...base, cancelledAt: NOW }, 'buyer', false, NOW).money.line, 'cancelled');
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
  const askedForTime = { ...waitingDelivery, extensionRequest: { requestedBy: 'seller' as const } };
  assert.deepEqual(dealView(askedForTime, 'seller', false, NOW).automatic, { kind: 'reclaim-waits', at: 1_790_200_000_000 + 3_600_000 });
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

test('a single-payment deal stays one payment from agreement to release', () => {
  const single: DealViewInput = {
    ...base,
    firstReleasePct: 100,
    sellerApprovedAt: NOW - 9 * 86_400_000,
    acceptedAt: NOW - 8 * 86_400_000,
    onChain: { state: 2, milestonesReleased: 0, milestonePcts: [100] },
  };
  assert.equal(dealView(single, 'seller', false, NOW).stage, 'awaiting-delivery');
  assert.deepEqual(dealView(single, 'seller', false, NOW).next, { action: 'deliver', actor: 'you', amountUsdc: null });
  const delivered = { ...single, delivered: true, deliveredAt: NOW - 86_400_000 };
  assert.deepEqual(dealView(delivered, 'buyer', false, NOW).next, { action: 'release', actor: 'you', amountUsdc: '1200' });
  assert.equal(dealView({ ...delivered, onChain: { state: 2, milestonesReleased: 1, milestonePcts: [100] } }, 'buyer', false, NOW).stage, 'settled');
});

test('the agreed split is used before the chain has one', () => {
  const split: DealViewInput = {
    ...base,
    firstReleasePct: 60,
    milestonePcts: [60, 30, 10],
    sellerApprovedAt: NOW - 9 * 86_400_000,
    acceptedAt: NOW - 8 * 86_400_000,
    delivered: true,
    deliveredAt: NOW - 86_400_000,
  };
  assert.deepEqual(dealView(split, 'buyer', false, NOW).next, { action: 'release', actor: 'you', amountUsdc: '720' });
  const one: DealViewInput = { ...split, firstReleasePct: 100, milestonePcts: undefined };
  assert.deepEqual(dealView(one, 'buyer', false, NOW).next, { action: 'release', actor: 'you', amountUsdc: '1200' });
});

test('a cancelled deal shows what happened, not the path it never took', () => {
  const neverFunded = dealView({ ...base, sellerApprovedAt: NOW - 5000, cancelledAt: NOW - 1000 }, 'buyer', false, NOW);
  assert.deepEqual(neverFunded.progress.map((p) => [p.step, p.state]), [['agreed', 'done'], ['cancelled', 'done']]);
  assert.equal(neverFunded.progress[1]!.at, NOW - 1000);

  const cancelled = { ...funded, cancelledAt: NOW - 1000 };
  const refunding = dealView(cancelled, 'buyer', false, NOW);
  assert.deepEqual(refunding.progress.map((p) => [p.step, p.state]), [['agreed', 'done'], ['funded', 'done'], ['cancelled', 'done'], ['refunded', 'current']]);
  const refunded = dealView({ ...cancelled, onChain: { state: 5, milestonesReleased: 0, milestonePcts: [50, 50] } }, 'buyer', false, NOW);
  assert.equal(refunded.progress.at(-1)!.state, 'done');
});

test('on the escrow family the seller is paid when the buyer’s review ends', () => {
  const suite = { ...delivered, escrowVersion: 'suite' as const };
  const open = { ...suite, releaseEligibleAtMs: NOW + 3_600_000 };
  assert.deepEqual(dealView(open, 'seller', false, NOW).automatic, { kind: 'auto-release', at: NOW + 3_600_000 });
  assert.deepEqual(dealView(open, 'buyer', false, NOW).automatic, { kind: 'auto-release', at: NOW + 3_600_000 });
});

test('money in escrow that the seller has not accepted reads as held, asks nobody to fund again, and says when it comes back', () => {
  const held: DealViewInput = {
    ...base,
    sellerApprovedAt: NOW - 86_400_000,
    fundTxHash: '0xfund',
    acceptUntilMs: NOW + 2 * 86_400_000,
    onChain: { state: 1, milestonesReleased: 0, milestonePcts: [100] },
  };
  const buyer = dealView(held, 'buyer', false, NOW);
  assert.equal(buyer.money.line, 'held');
  assert.deepEqual(buyer.next, { action: null, actor: 'nobody', amountUsdc: null });
  assert.deepEqual(buyer.automatic, { kind: 'unaccepted-refund', at: NOW + 2 * 86_400_000 });
  assert.equal(buyer.progress.find((p) => p.step === 'funded')?.state, 'done');
});

test('a deal refunded before the seller accepted shows the money went in and came back', () => {
  const back: DealViewInput = { ...base, sellerApprovedAt: NOW - 86_400_000, fundTxHash: '0xfund', cancelledAt: NOW, onChain: { state: 5, milestonesReleased: 0, milestonePcts: [100] } };
  const view = dealView(back, 'buyer', false, NOW);
  assert.equal(view.money.line, 'refunded');
  assert.deepEqual(view.progress.map((p) => p.step), ['agreed', 'funded', 'cancelled', 'refunded']);
});

test('the view carries one hold line: a held link first, else a held match, nothing once cleared or closed', () => {
  assert.equal(dealView(funded, 'buyer', false, NOW).hold, null);
  const match = { ...funded, matchHoldLine: 'A past delivery link from one side was flagged by the safety check. A person at Karwan looks at it. Nothing is blocked.' };
  assert.deepEqual(dealView(match, 'buyer', false, NOW).hold, { kind: 'match', line: match.matchHoldLine });
  assert.equal(dealView(match, 'seller', false, NOW).hold?.kind, 'match');
  const link = { ...delivered, verificationStatus: 'suspicious', matchHoldLine: match.matchHoldLine };
  assert.equal(dealView(link, 'buyer', false, NOW).hold?.kind, 'link', 'a held link outranks the match hold: it does stop payment');
  assert.equal(holdOf({ ...match, settledAt: NOW }), null);
  assert.equal(holdOf({ ...match, matchHoldLine: null }), null);
});
