import assert from 'node:assert/strict';
import test from 'node:test';
import { timelineLine, TIMELINE_EVENTS } from './dealTimeline.js';

test('each step of a deal has a plain line in the deal chat', () => {
  assert.equal(timelineLine('deal.accepted'), 'The seller accepted the agreement.');
  assert.equal(timelineLine('escrow.funded'), 'The buyer funded the escrow. The money is held until release.');
  assert.equal(timelineLine('deal.release.blocked'), 'The delivery check paused the payment.');
  assert.equal(timelineLine('escrow.milestone.released'), 'A payment was released to the seller.');
  assert.equal(timelineLine('escrow.refunded'), 'The money went back to the buyer.');
});

test('events that are not deal steps add nothing, and delivery keeps its own line', () => {
  assert.equal(timelineLine('deal.review.heartbeat'), null);
  assert.equal(timelineLine('deal.delivered'), null);
  assert.ok(TIMELINE_EVENTS.size >= 14);
});
