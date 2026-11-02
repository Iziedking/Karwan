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

 test('account completion resumes a selected task after the required steps', async () => {
  const { afterAccountCreated } = await import('./afterCreate');
  const task = '/buyer?mode=direct&seller=%40ada&amount=120#new-deal';
  assert.equal(afterAccountCreated(task), task);
  for (const bad of [null,'https://evil.test','//evil.test','/start#about']) assert.equal(afterAccountCreated(bad),'/start?step=about');
 });
