import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationKind, sellerNudge } from './notificationKind';

test('notifications sort into the kind that decides their icon', () => {
  assert.equal(notificationKind('deal.direct.edited'), 'attention');
  assert.equal(notificationKind('deal.cancel.proposed'), 'attention');
  assert.equal(notificationKind('wallet.credited'), 'money');
  assert.equal(notificationKind('escrow.milestone.released'), 'money');
  assert.equal(notificationKind('escrow.settled'), 'done');
  assert.equal(notificationKind('deal.matched'), 'match');
  assert.equal(notificationKind('deal.delivered'), 'deal');
});

test('a seller nudge opens the request it is about, once per request', () => {
  assert.deepEqual(sellerNudge('agent.suggestion', { jobId: '0xjob' }, 5), { id: 'agent.suggestion-0xjob', href: '/jobs/0xjob' });
  assert.deepEqual(sellerNudge('trend.match', {}, 5), { id: 'trend.match-5', href: '/market' });
  assert.equal(sellerNudge('deal.matched', {}, 5), null);
});
