import assert from 'node:assert/strict';
import test from 'node:test';
import { ASK_KEY } from '@/features/assistant/carriedAsk';
import { ASSISTANT_OPEN_EVENT, PERSON_KEY, takePersonCarry, type AssistantOpenDetail } from './openAssistant';
import { callPerson, openHelp } from './openHelp';

/// Any screen can open the assistant page with a question already asked, or
/// bring in a person on Help and support (view 57).
///
///   npx tsx --test shared/assistant/openHelp.test.ts

function stage() {
  const data = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  const target = new EventTarget();
  (globalThis as { window?: unknown }).window = target;
  const got: AssistantOpenDetail[] = [];
  target.addEventListener(ASSISTANT_OPEN_EVENT, (e) => { got.push((e as CustomEvent<AssistantOpenDetail>).detail); });
  return { data, got };
}

test('a question to send is carried to the assistant page', () => {
  const { data, got } = stage();
  openHelp('I sell: Logo design. Post this as my offer.', { send: true });
  assert.equal(data.get(ASK_KEY), 'I sell: Logo design. Post this as my offer.');
  assert.deepEqual(got, [{ to: 'assistant' }]);
});

test('opening without a question just opens the page', () => {
  const { data, got } = stage();
  openHelp();
  assert.equal(data.has(ASK_KEY), false);
  assert.deepEqual(got, [{ to: 'assistant' }]);
});

test('calling a person carries the last thing they said and the deal to Help and support', () => {
  const { data, got } = stage();
  callPerson([{ role: 'user', content: 'Where is my refund?' }, { role: 'assistant', content: 'Let me check.' }, { role: 'user', content: 'stuck' }], { dealId: 'd1' });
  assert.deepEqual(JSON.parse(data.get(PERSON_KEY)!), { message: 'stuck', dealId: 'd1' });
  assert.deepEqual(got, [{ to: 'person', href: '/profile/help?deal=d1' }]);
  assert.deepEqual(takePersonCarry(), { message: 'stuck', dealId: 'd1' });
  assert.equal(takePersonCarry(), null);
});

test('a first message given outright wins over the conversation', () => {
  const { got } = stage();
  callPerson([{ role: 'user', content: 'hi' }], { message: 'My link was flagged but it is safe.' });
  assert.deepEqual(takePersonCarry(), { message: 'My link was flagged but it is safe.', dealId: null });
  assert.deepEqual(got, [{ to: 'person', href: '/profile/help' }]);
});

test('a deal id is put in the address safely', () => {
  const { got } = stage();
  callPerson([], { dealId: 'a b&c' });
  assert.equal(got[0]?.to === 'person' && got[0].href, '/profile/help?deal=a%20b%26c');
});

test('nothing breaks outside a browser', () => {
  delete (globalThis as { window?: unknown }).window;
  assert.doesNotThrow(() => openHelp('x', { send: true }));
  assert.doesNotThrow(() => callPerson([]));
});
