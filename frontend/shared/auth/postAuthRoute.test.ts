import assert from 'node:assert/strict';
import test from 'node:test';
import { postAuthDestination } from './postAuthRoute';

test('a new identity choosing create account enters onboarding', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'new',
      accountExists: false,
      profileExists: false,
      requestedHref: '/app',
    }),
    { kind: 'continue', destination: '/onboarding' },
  );
});

test('an existing profile continues to the requested workspace', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'returning',
      accountExists: true,
      profileExists: true,
      requestedHref: '/app',
    }),
    { kind: 'continue', destination: '/app' },
  );
});

test('an established identity choosing create account is redirected to sign in', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'new',
      accountExists: true,
      profileExists: true,
      requestedHref: '/app',
    }),
    { kind: 'needs-sign-in' },
  );
});

test('an unknown identity choosing sign in is redirected to account creation', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'returning',
      accountExists: false,
      profileExists: false,
      requestedHref: '/app',
    }),
    { kind: 'needs-create' },
  );
});

test('an existing account with incomplete setup resumes onboarding', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'returning',
      accountExists: true,
      profileExists: false,
      requestedHref: '/app',
    }),
    { kind: 'continue', destination: '/onboarding' },
  );
});

test('embedded onboarding authentication stays on the current step', () => {
  assert.deepEqual(
    postAuthDestination({
      intent: 'new',
      accountExists: false,
      profileExists: false,
      requestedHref: null,
    }),
    { kind: 'continue', destination: null },
  );
});
