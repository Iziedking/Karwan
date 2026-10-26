import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { awaitingNextDelivery, currentMilestoneDelivered } from './milestoneDelivery.js';

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({ jobId: 'deal-1', buyer: '0xb', seller: '0xs', escrowVersion: 'suite', acceptedAt: 1, delivered: true, ...over }) as DirectDeal;

test('on the escrow family each milestone needs its own delivery before it can be paid', () => {
  // Milestone 1 delivered, nothing paid: the buyer can release it.
  assert.equal(currentMilestoneDelivered(deal({ deliveredMilestone: 0 }), 0), true);
  // Milestone 1 paid, the delivery was for milestone 1: milestone 2 waits on the seller.
  assert.equal(awaitingNextDelivery(deal({ deliveredMilestone: 0 }), 1), true);
  assert.equal(currentMilestoneDelivered(deal({ deliveredMilestone: 0 }), 1), false);
  // The seller delivered milestone 2.
  assert.equal(currentMilestoneDelivered(deal({ deliveredMilestone: 1 }), 1), true);
  assert.equal(awaitingNextDelivery(deal({ deliveredMilestone: 1 }), 1), false);
});

test('a delivery recorded before milestones were tracked counts as the first one', () => {
  assert.equal(awaitingNextDelivery(deal(), 0), false);
  assert.equal(awaitingNextDelivery(deal(), 1), true);
});

test('nothing delivered is not "the next delivery is due", and closed deals wait on nobody', () => {
  assert.equal(awaitingNextDelivery(deal({ delivered: false }), 1), false);
  assert.equal(currentMilestoneDelivered(deal({ delivered: false }), 0), false);
  assert.equal(awaitingNextDelivery(deal({ settledAt: 2 }), 1), false);
  assert.equal(awaitingNextDelivery(deal({ cancelledAt: 2 }), 1), false);
});

test('deals on the earliest escrow keep its rule: one delivery, then the payments', () => {
  assert.equal(awaitingNextDelivery(deal({ escrowVersion: undefined }), 1), false);
  assert.equal(currentMilestoneDelivered(deal({ escrowVersion: undefined }), 1), true);
  assert.equal(awaitingNextDelivery(deal({ escrowVersion: 'v3' }), 1), true);
});
