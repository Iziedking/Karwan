import assert from 'node:assert/strict';
import test from 'node:test';
import { afterCreate } from './afterCreate';

/// A new account goes on to setup, after the recovery step when that is on.
///
///   npx tsx --test features/signup/afterCreate.test.ts

test('a new account goes to setup', () => {
  assert.equal(afterCreate({ recoveryStep: false }), '/setup');
});

test('the recovery step comes first when it is on', () => {
  assert.equal(afterCreate({ recoveryStep: true }), 'recovery');
});
