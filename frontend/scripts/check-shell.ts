import assert from 'node:assert/strict';
import {
  getShellSurface,
  isBareRoute,
  isFocusedRoute,
  isPublicAccessRoute,
  isPublicDiscoveryRoute,
  isPublicEditorialRoute,
} from '../shared/utils/routes';

const publicEditorial = [
  '/',
  '/brand',
  '/how-it-works',
  '/docs',
  '/docs/disputes',
  '/newsletter/example',
  '/terms',
  '/feedback',
  '/credit-passport/0x123',
  '/x402',
];

for (const route of publicEditorial) {
  assert.equal(isPublicEditorialRoute(route), true, `${route} must be editorial public`);
  assert.equal(getShellSurface(route, false), 'public', `${route} must use public chrome`);
  assert.equal(getShellSurface(route, true), 'public', `${route} stays public after sign-in`);
}

for (const route of ['/market', '/listings/example', '/partners']) {
  assert.equal(isPublicDiscoveryRoute(route), true, `${route} must support public discovery`);
  assert.equal(isPublicAccessRoute(route), true, `${route} must not force authentication`);
  assert.equal(getShellSurface(route, false), 'public', `${route} is public before sign-in`);
  assert.equal(getShellSurface(route, true), 'workspace', `${route} joins the signed-in workspace`);
}

// Onboarding is focused whoever you are: leaving mid-setup is what it guards.
for (const route of ['/onboarding', '/onboarding?step=profile']) {
  const normalized = route.split('?')[0];
  assert.equal(isFocusedRoute(normalized), true, `${normalized} must be focused`);
  assert.equal(getShellSurface(normalized, false), 'focused');
  assert.equal(getShellSurface(normalized, true), 'focused', `${normalized} stays focused`);
}

// Cashout is focused only for someone who has no app to navigate. A signed-in
// person cashing out their own deal keeps their nav; taking it away left them
// on a page inside the product with no way through it.
assert.equal(isFocusedRoute('/cashout/job-1'), true);
assert.equal(getShellSurface('/cashout/job-1', false), 'focused', 'a stranger sees the focused flow');
assert.equal(
  getShellSurface('/cashout/job-1', true),
  'workspace',
  'a signed-in cashout keeps its navigation',
);

assert.equal(isBareRoute('/invite/token-1'), true);
assert.equal(getShellSurface('/invite/token-1', false), 'bare');
assert.equal(getShellSurface('/admin/treasury', true), 'admin');
assert.equal(getShellSurface('/app', false), 'workspace');
assert.equal(getShellSurface('/app', true), 'workspace');
assert.equal(isPublicAccessRoute('/marketplace'), false, 'route prefixes must stop at boundaries');

console.log('Shell route model passed.');
