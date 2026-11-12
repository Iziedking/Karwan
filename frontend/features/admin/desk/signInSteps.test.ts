import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, nextSignInStep, type SignInState } from './signInSteps';

const me = { id: 'm1', name: 'Tobi', email: 'tobi@x.com', owner: false, pages: ['support'], access: { support: 'change' as const } };

test('a testnet password answer signs in at once', () => {
  const s = nextSignInStep(START, { kind: 'answer', body: { expiresAt: 1, me } });
  assert.deepEqual(s, { step: 'done', me, error: null });
});

test('mainnet asks for the code, or for setup the first time', () => {
  assert.deepEqual(nextSignInStep(START, { kind: 'answer', body: { step: 'code', ticket: 't1' } }), { step: 'code', ticket: 't1', error: null });
  assert.deepEqual(nextSignInStep(START, { kind: 'answer', body: { step: 'setup', ticket: 't2', otpauth: 'otpauth://x' } }), {
    step: 'setup',
    ticket: 't2',
    otpauth: 'otpauth://x',
    error: null,
  });
});

test('a right code signs in; setup keeps its picture until then', () => {
  const setup: SignInState = { step: 'setup', ticket: 't2', otpauth: 'otpauth://x', error: null };
  assert.deepEqual(nextSignInStep(setup, { kind: 'signed-in', me }), { step: 'done', me, error: null });
});

test('a wrong or locked code stays on the code with the server\'s words', () => {
  const code: SignInState = { step: 'code', ticket: 't1', error: null };
  assert.deepEqual(nextSignInStep(code, { kind: 'error', status: 401, message: 'That code is not right.' }), { ...code, error: 'That code is not right.' });
  assert.deepEqual(nextSignInStep(code, { kind: 'error', status: 429, message: 'Too many wrong codes. Wait 15 minutes.' }), {
    ...code,
    error: 'Too many wrong codes. Wait 15 minutes.',
  });
});

test('an expired ticket goes back to the password', () => {
  const code: SignInState = { step: 'code', ticket: 't1', error: null };
  assert.deepEqual(nextSignInStep(code, { kind: 'error', status: 401, message: 'Sign in again.' }), { step: 'password', error: 'Sign in again.' });
});

test('a wrong password stays on the password', () => {
  assert.deepEqual(nextSignInStep(START, { kind: 'error', status: 401, message: 'That email and password do not match a desk member.' }), {
    step: 'password',
    error: 'That email and password do not match a desk member.',
  });
});

test('using a different account starts over', () => {
  assert.deepEqual(nextSignInStep({ step: 'code', ticket: 't1', error: 'x' }, { kind: 'restart' }), START);
});
