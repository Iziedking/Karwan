import assert from 'node:assert/strict';
import test from 'node:test';
import { RETURN_KEY, rememberReturn, takeReturn } from './assistantReturn';

/// Turning the assistant off goes back to the page it was turned on from.
///
///   npx tsx --test features/assistant/assistantReturn.test.ts

function fakeStorage(throwing = false) {
  const data = new Map<string, string>();
  const store = {
    getItem: (k: string) => { if (throwing) throw new Error('blocked'); return data.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (throwing) throw new Error('blocked'); data.set(k, v); },
    removeItem: (k: string) => { if (throwing) throw new Error('blocked'); data.delete(k); },
  };
  (globalThis as { sessionStorage?: unknown }).sessionStorage = store;
  return data;
}

test('the page it was turned on from comes back once, then Home', () => {
  const data = fakeStorage();
  rememberReturn('/deals/0xabc');
  assert.equal(data.get(RETURN_KEY), '/deals/0xabc');
  assert.equal(takeReturn(), '/deals/0xabc');
  assert.equal(takeReturn(), '/app');
});

test('the assistant itself and the landing page are never remembered', () => {
  fakeStorage();
  rememberReturn('/assistant');
  rememberReturn('/');
  assert.equal(takeReturn(), '/app');
  rememberReturn('/market');
  rememberReturn('/assistant');
  assert.equal(takeReturn(), '/market');
});

test('blocked storage still goes Home', () => {
  fakeStorage(true);
  assert.doesNotThrow(() => rememberReturn('/deals/0xabc'));
  assert.equal(takeReturn(), '/app');
});
