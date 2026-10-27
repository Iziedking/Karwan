import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCheckStatus, heldDetailOf } from './checkStatus';

test('a link held for a safety check is held and says so, before the watcher records it', () => {
  const held = { deliveryCheck: 'passed' as const, verificationStatus: 'suspicious' as const };
  assert.equal(deliveryCheckStatus(held, 'awaiting-first-release'), 'held');
  assert.equal(heldDetailOf(held), 'security-hold');
  assert.equal(heldDetailOf({ releaseBlockedDetail: 'off-request', releaseBlockedReason: 'requirement-mismatch' }), 'off-request');
  assert.equal(heldDetailOf({ deliveryCheck: 'held' }), 'off-request', 'a verdict hold with no detail yet is the work, not the link');
});

test('the check state shows while the deal waits on release', () => {
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'checking' }, 'awaiting-first-release'), 'checking');
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'passed' }, 'awaiting-final-release'), 'passed');
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'held' }, 'awaiting-first-release'), 'held');
});

test('a hold the watcher applied counts even before the verdict reaches this view', () => {
  assert.equal(deliveryCheckStatus({ releaseBlockedReason: 'requirement-mismatch' }, 'awaiting-first-release'), 'held');
});

test('the last milestone\'s check is not shown while the next one waits for delivery', () => {
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'passed' }, 'awaiting-delivery'), null);
  assert.equal(deliveryCheckStatus({ releaseBlockedReason: 'no-agent-wallet' }, 'awaiting-delivery'), 'held');
});

test('no status once the deal closes or without a check', () => {
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'passed' }, 'settled'), null);
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'held' }, 'cancelled'), null);
  assert.equal(deliveryCheckStatus({}, 'awaiting-first-release'), null);
});
