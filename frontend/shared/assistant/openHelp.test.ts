import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_OPEN_EVENT, callPerson, openHelp } from './openHelp';

/// Any screen can open Help, optionally with a question already typed.
///
///   npx tsx --test shared/assistant/openHelp.test.ts

test('opening Help carries the question to the panel', () => {
  const target = new EventTarget();
  (globalThis as { window?: unknown }).window = target;
  let got: unknown = null;
  target.addEventListener(HELP_OPEN_EVENT, (e) => { got = (e as CustomEvent).detail; });
  openHelp('Is there a fee?');
  assert.deepEqual(got, { prefill: 'Is there a fee?' });
});

test('assistant mode hands its conversation to a person through Help', () => {
  const target = new EventTarget();
  (globalThis as { window?: unknown }).window = target;
  let got: unknown = null;
  target.addEventListener(HELP_OPEN_EVENT, (e) => { got = (e as CustomEvent).detail; });
  const transcript = [{ role: 'user' as const, content: 'My payment is stuck' }];
  callPerson(transcript);
  assert.deepEqual(got, { person: true, context: transcript });
});

test('a deal page asks for a person with its own message and the deal attached', () => {
  const target = new EventTarget();
  (globalThis as { window?: unknown }).window = target;
  let got: unknown = null;
  target.addEventListener(HELP_OPEN_EVENT, (e) => { got = (e as CustomEvent).detail; });
  callPerson([], { message: 'My link was flagged but it is safe.', dealId: '0xabc' });
  assert.deepEqual(got, { person: true, context: [], message: 'My link was flagged but it is safe.', dealId: '0xabc' });
});

test('opening Help without a browser does nothing', () => {
  delete (globalThis as { window?: unknown }).window;
  assert.doesNotThrow(() => openHelp());
});
