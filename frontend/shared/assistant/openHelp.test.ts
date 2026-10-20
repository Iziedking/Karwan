import assert from 'node:assert/strict';
import test from 'node:test';
import { HELP_OPEN_EVENT, openHelp } from './openHelp';

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

test('opening Help without a browser does nothing', () => {
  delete (globalThis as { window?: unknown }).window;
  assert.doesNotThrow(() => openHelp());
});
