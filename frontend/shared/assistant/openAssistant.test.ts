import assert from 'node:assert/strict';
import test from 'node:test';
import { RETURN_KEY } from '@/features/assistant/assistantReturn';
import { isShortcut, openAssistant } from './openAssistant';

/// Aman, Ctrl+K and the Profile row all open the assistant page (view 57).
///
///   npx tsx --test shared/assistant/openAssistant.test.ts

function storage() {
  const data = new Map<string, string>();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
  return data;
}

const key = (over: Partial<{ key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; target: EventTarget | null }> = {}) =>
  ({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, target: null, ...over });

const field = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget;

test('Ctrl+K and Cmd+K open the assistant page', () => {
  assert.equal(isShortcut(key()), true);
  assert.equal(isShortcut(key({ key: 'K' })), true);
  assert.equal(isShortcut(key({ ctrlKey: false, metaKey: true })), true);
});

test('K alone, or with Alt, does nothing', () => {
  assert.equal(isShortcut(key({ ctrlKey: false })), false);
  assert.equal(isShortcut(key({ altKey: true })), false);
  assert.equal(isShortcut(key({ key: 'j' })), false);
});

test('typing in a field never opens it', () => {
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(isShortcut(key({ target: field(tag) })), false, tag);
  assert.equal(isShortcut(key({ target: field('DIV', true) })), false);
  assert.equal(isShortcut(key({ target: field('BUTTON') })), true);
});

test('opening remembers the page and goes to the assistant once', () => {
  const data = storage();
  delete (globalThis as { window?: unknown }).window;
  const pushed: string[] = [];
  openAssistant('/market', (href) => pushed.push(href));
  assert.equal(data.get(RETURN_KEY), '/market');
  assert.deepEqual(pushed, ['/assistant']);
});

test('opening from the assistant page keeps the page it came from', () => {
  const data = storage();
  data.set(RETURN_KEY, '/deals/0xabc');
  const pushed: string[] = [];
  openAssistant('/assistant', (href) => pushed.push(href));
  assert.equal(data.get(RETURN_KEY), '/deals/0xabc');
  assert.deepEqual(pushed, ['/assistant']);
});
