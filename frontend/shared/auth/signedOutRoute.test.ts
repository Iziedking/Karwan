import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SIGNED_OUT_ROUTE } from './signedOutRoute';

test('every explicit sign-out control uses the shared app destination', () => {
  assert.equal(SIGNED_OUT_ROUTE, '/app');
  // Profile and the desktop rail both sign out through one hook.
  const profile = readFileSync(new URL('../../features/profile/useSignOutRequest.ts', import.meta.url), 'utf8');
  const modal = readFileSync(new URL('../components/CircleAccountModal.tsx', import.meta.url), 'utf8');
  assert.match(profile, /leave: \(destination\) => router\.replace\(destination\)/);
  assert.match(modal, /await auth\.signOut\(\);\s*onClose\(\);\s*router\.replace\(SIGNED_OUT_ROUTE\)/);
});

test('signed-out app entry stays available when backend status is unavailable', () => {
  const page = readFileSync(new URL('../../app/app/page.tsx', import.meta.url), 'utf8');
  const gate = page.indexOf('if (!isConnected) return <SignInGate variant="hero" />');
  const offline = page.indexOf('if (!statusQuery.isPending && !statusQuery.data)');
  assert.ok(gate > 0 && offline > gate);
});
