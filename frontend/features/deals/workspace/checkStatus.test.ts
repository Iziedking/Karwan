import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryCheckStatus } from './checkStatus';

test('the check state shows while the deal waits on release', () => {
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'checking' }, 'awaiting-first-release'), 'checking');
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'passed' }, 'awaiting-final-release'), 'passed');
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'held' }, 'awaiting-first-release'), 'held');
});

test('a hold the watcher applied counts even before the verdict reaches this view', () => {
  assert.equal(deliveryCheckStatus({ releaseBlockedReason: 'requirement-mismatch' }, 'awaiting-first-release'), 'held');
});

test('no status once the deal closes or without a check', () => {
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'passed' }, 'settled'), null);
  assert.equal(deliveryCheckStatus({ deliveryCheck: 'held' }, 'cancelled'), null);
  assert.equal(deliveryCheckStatus({}, 'awaiting-first-release'), null);
});
