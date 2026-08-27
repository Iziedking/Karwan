import assert from 'node:assert/strict';
import test from 'node:test';

import { hrefForEvent } from './eventRouting';

const id = '0x6f8ce23379dbe6f88dfabf0310893eecb4c06844d72bfb2c15e809a5935d1e77';

test('routes contract-backed escrow events to deal detail', () => {
  assert.equal(hrefForEvent({ jobId: id, type: 'escrow.settled' }), `/deals/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'escrow.milestone.released' }), `/deals/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'cashout.arc.completed' }), `/deals/${id}`);
});

test('routes direct deal lifecycle events to deal detail', () => {
  assert.equal(hrefForEvent({ jobId: id, type: 'deal.direct.created' }), `/deals/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'deal.accepted' }), `/deals/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'deal.review.started' }), `/deals/${id}`);
});

test('keeps pre-agreement matching events on the job route', () => {
  assert.equal(hrefForEvent({ jobId: id, type: 'deal.matched' }), `/jobs/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'deal.match.approved' }), `/jobs/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'bid.submitted' }), `/jobs/${id}`);
  assert.equal(hrefForEvent({ jobId: id, type: 'agent.skipped' }), `/jobs/${id}`);
});

test('does not create a link when the event has no resource id', () => {
  assert.equal(hrefForEvent({ type: 'escrow.settled' }), null);
});
