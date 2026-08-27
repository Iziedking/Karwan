import assert from 'node:assert/strict';
import test from 'node:test';
import { publicJobStatus } from './jobPublicStatus.js';

test('terminal decline is not exposed as active negotiation', () => {
  assert.equal(
    publicJobStatus({ cancelled: false, expired: false, ended: true, matched: false }),
    'ended',
  );
});

test('a proposal or near miss remains an active private workflow', () => {
  assert.equal(
    publicJobStatus({ cancelled: false, expired: false, ended: true, matched: true }),
    'negotiating',
  );
});

test('cancelled and expired states retain their precedence', () => {
  assert.equal(
    publicJobStatus({ cancelled: true, expired: false, ended: false, matched: false }),
    'cancelled',
  );
  assert.equal(
    publicJobStatus({ cancelled: false, expired: true, ended: true, matched: false }),
    'expired',
  );
});
