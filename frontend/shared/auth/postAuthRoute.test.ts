import assert from 'node:assert/strict';
import test from 'node:test';
import { postAuthDestination } from './postAuthRoute';

test('profile-less email and wallet identities enter onboarding', () => {
  for (const intent of ['new', 'returning'] as const) {
    assert.equal(
      postAuthDestination({ intent, profileExists: false, requestedHref: '/app' }),
      '/onboarding',
    );
  }
});

test('an existing profile continues to the requested workspace', () => {
  assert.equal(
    postAuthDestination({ intent: 'new', profileExists: true, requestedHref: '/app' }),
    '/app',
  );
});

test('embedded onboarding authentication stays on the current step', () => {
  assert.equal(
    postAuthDestination({ intent: 'new', profileExists: false, requestedHref: null }),
    null,
  );
});
