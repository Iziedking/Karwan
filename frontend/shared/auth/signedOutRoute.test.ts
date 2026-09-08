import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SIGNED_OUT_ROUTE } from './signedOutRoute';

test('both explicit sign-out controls use the shared app destination', () => {
  assert.equal(SIGNED_OUT_ROUTE, '/app');
  const profile = readFileSync(new URL('../../features/profile/components/ProfileSignOut.tsx', import.meta.url), 'utf8');
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
