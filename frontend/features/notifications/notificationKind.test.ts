import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationKind } from './notificationKind';

test('notifications sort into the kind that decides their icon', () => {
  assert.equal(notificationKind('deal.direct.edited'), 'attention');
  assert.equal(notificationKind('deal.cancel.proposed'), 'attention');
  assert.equal(notificationKind('wallet.credited'), 'money');
  assert.equal(notificationKind('escrow.milestone.released'), 'money');
  assert.equal(notificationKind('escrow.settled'), 'done');
  assert.equal(notificationKind('deal.matched'), 'match');
  assert.equal(notificationKind('deal.delivered'), 'deal');
});
