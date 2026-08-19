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

for (const route of ['/onboarding', '/onboarding?step=profile', '/cashout/job-1']) {
  const normalized = route.split('?')[0];
  assert.equal(isFocusedRoute(normalized), true, `${normalized} must be focused`);
  assert.equal(getShellSurface(normalized, true), 'focused');
}

assert.equal(isBareRoute('/invite/token-1'), true);
assert.equal(getShellSurface('/invite/token-1', false), 'bare');
assert.equal(getShellSurface('/admin/treasury', true), 'admin');
assert.equal(getShellSurface('/app', false), 'workspace');
assert.equal(getShellSurface('/app', true), 'workspace');
assert.equal(isPublicAccessRoute('/marketplace'), false, 'route prefixes must stop at boundaries');

console.log('Shell route model passed.');
