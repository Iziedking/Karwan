import assert from 'node:assert/strict';
import test from 'node:test';
import { afterCreate } from './afterCreate';

/// A new account goes on to "About you" on /start, after the recovery step
/// when that is on.
///
///   npx tsx --test features/signup/afterCreate.test.ts

test('a new account stays on /start for About you', () => {
  assert.equal(afterCreate({ recoveryStep: false }), '/start?step=about');
});

test('the recovery step comes first when it is on', () => {
  assert.equal(afterCreate({ recoveryStep: true }), 'recovery');
});
