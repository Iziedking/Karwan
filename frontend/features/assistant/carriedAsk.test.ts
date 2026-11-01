import assert from 'node:assert/strict';
import test from 'node:test';
import { ASK_KEY, carryAsk, takeAsk } from './carriedAsk';

/// A question asked on Home reaches assistant mode once.
///
///   npx tsx --test features/assistant/carriedAsk.test.ts

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

test('the question is taken once, then nothing', () => {
  const data = fakeStorage();
  carryAsk('  Post my offer ');
  assert.equal(data.get(ASK_KEY), 'Post my offer');
  assert.equal(takeAsk(), 'Post my offer');
  assert.equal(takeAsk(), null);
});

test('blank words carry nothing', () => {
  const data = fakeStorage();
  carryAsk('   ');
  assert.equal(data.has(ASK_KEY), false);
  assert.equal(takeAsk(), null);
});

test('blocked storage opens assistant mode without a question', () => {
  fakeStorage(true);
  assert.doesNotThrow(() => carryAsk('Request a payment'));
  assert.equal(takeAsk(), null);
});
