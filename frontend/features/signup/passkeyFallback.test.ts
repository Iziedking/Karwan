import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { passkeyFallback } from './passkeyFallback';

test('where Karwan holds the wallet, an email code is always offered beside the passkey', () => {
  // Some browsers and places cannot reach a passkey at all (an embedded
  // browser, a borrowed laptop). The code already signs these accounts in.
  assert.equal(passkeyFallback({ userHoldsKeys: false, recoveryOn: false }), 'email');
  assert.equal(passkeyFallback({ userHoldsKeys: false, recoveryOn: true }), 'email');
});

test('where the passkey holds the wallet, an email code cannot stand in for it, so recovery is the way back', () => {
  assert.equal(passkeyFallback({ userHoldsKeys: true, recoveryOn: true }), 'recovery');
  assert.equal(passkeyFallback({ userHoldsKeys: true, recoveryOn: false }), null);
});

test('the passkey screen renders the fallback it is given', () => {
  const card = readFileSync(new URL('./components/AuthCard.tsx', import.meta.url), 'utf8');
  const step = card.slice(card.indexOf("{inStep === 'passkey' && ("), card.indexOf("{inStep === 'code' && ("));
  assert.match(step, /fallback === 'email'/);
  assert.match(step, /sendCode\(\)/);
  assert.match(step, /t\.signIn\.useCodeInstead/);
  assert.match(step, /fallback === 'recovery'/);
});
