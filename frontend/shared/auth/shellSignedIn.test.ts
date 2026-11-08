import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { shellSignedIn } from './shellSignedIn';

/// Pages opened in the public look and then jumped into the app once the
/// sign-in check answered, one to four seconds later (owner, 8 Nov 2026).
///
///   npx tsx --test shared/auth/shellSignedIn.test.ts

test('the answer of the sign-in check decides once it is in', () => {
  assert.equal(shellSignedIn({ authenticated: true, loading: false, hint: false, pathname: '/market' }), true);
  assert.equal(shellSignedIn({ authenticated: false, loading: false, hint: true, pathname: '/deals' }), false);
});

test('while it is on its way, the browser note decides', () => {
  assert.equal(shellSignedIn({ authenticated: false, loading: true, hint: true, pathname: '/market' }), true);
  assert.equal(shellSignedIn({ authenticated: false, loading: true, hint: false, pathname: '/deals' }), false);
});

test('on the server, a signed-in-only page draws the app frame and a shared page the public one', () => {
  for (const p of ['/app', '/deals', '/money', '/profile']) {
    assert.equal(shellSignedIn({ authenticated: false, loading: true, hint: null, pathname: p }), true, p);
  }
  for (const p of ['/', '/market', '/how-it-works', '/docs']) {
    assert.equal(shellSignedIn({ authenticated: false, loading: true, hint: null, pathname: p }), false, p);
  }
});

test('the frame, the top bar and the phone tabs all draw from it', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  for (const file of ['../components/ChromeFrame.tsx', '../components/TopNav.tsx', '../components/WorkspaceBottomNav.tsx']) {
    const s = read(file);
    assert.match(s, /useShellSignedIn\(pathname, /, file);
    assert.doesNotMatch(s, /getShellSurface\(pathname, (auth\.)?isAuthenticated\)/, file);
  }
});
