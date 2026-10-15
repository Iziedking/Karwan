import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { entryHref, rememberSignedIn, wasSignedIn } from './signedInHint';

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

test('the hint follows the last known session and holds nothing sensitive', () => {
  const store = memory();
  assert.equal(wasSignedIn(store), false);
  rememberSignedIn(true, store);
  assert.equal(wasSignedIn(store), true);
  assert.equal(store.getItem('karwan.signedIn'), '1');
  rememberSignedIn(false, store);
  assert.equal(wasSignedIn(store), false);
});

test('blocked storage never breaks the page; it just means sign in', () => {
  const blocked = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
  assert.doesNotThrow(() => rememberSignedIn(true, blocked));
  assert.equal(wasSignedIn(blocked), false);
  assert.equal(wasSignedIn(null), false);
});

test('someone signed in opens the app, everyone else the sign-in page', () => {
  assert.equal(entryHref(true, '/app'), '/app');
  assert.equal(entryHref(false, '/app'), '/start');
});

test('the session store keeps the hint, and the landing reads it without calling auth', () => {
  const store = readFileSync(new URL('./sessionStore.ts', import.meta.url), 'utf8');
  assert.match(store, /if \(loaded\) rememberSignedIn\(!!session\)/);
  const landing = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(landing, /href="\/start"/, 'both Open buttons use the entry link');
  assert.match(landing, /useEntryHref\(\)/);
  assert.doesNotMatch(landing, /useAuth|useSiwe/, 'the landing never runs sign-in');
});

test('every Open Karwan link uses the same entry link', () => {
  for (const file of ['../components/TopNav.tsx', '../components/PublicMenu.tsx', '../../features/docs/components/ProductOverview.tsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /useEntryHref\(\)/, file);
    assert.doesNotMatch(src, /href="\/start"|href=\{START_ROUTE\}/, file);
  }
});
