import assert from 'node:assert/strict';
import test from 'node:test';
import { channelsFor } from './notifyVia.js';

/// "How should we reach you" (view 19), applied by the email and Telegram
/// notifiers. Nobody is ever left with no channel.
///
///   npx tsx --test src/channels/notifyVia.test.ts

test('no answer means both', () => {
  assert.deepEqual(channelsFor(undefined, true), { email: true, telegram: true });
  assert.deepEqual(channelsFor({}, true), { email: true, telegram: true });
});

test('telegram means telegram only, while it is linked', () => {
  assert.deepEqual(channelsFor({ notifyVia: 'telegram' }, true), { email: false, telegram: true });
});

test('telegram with no link falls back to email', () => {
  assert.deepEqual(channelsFor({ notifyVia: 'telegram' }, false), { email: true, telegram: false });
});

test('email means email only', () => {
  assert.deepEqual(channelsFor({ notifyVia: 'email' }, true), { email: true, telegram: false });
  assert.deepEqual(channelsFor({ notifyVia: 'email' }, false), { email: true, telegram: false });
});

test('both stays both', () => {
  assert.deepEqual(channelsFor({ notifyVia: 'both' }, true), { email: true, telegram: true });
});
