import assert from 'node:assert/strict';
import test from 'node:test';
import { getProductBackHref, isPublicAccessRoute, isPublicEditorialRoute, previousRoute } from './routes.js';

test('the public numbers page never asks a visitor to sign in, at its docs home or its old address', () => {
  for (const path of ['/docs/numbers', '/activity/all-time']) {
    assert.equal(isPublicEditorialRoute(path), true, path);
    assert.equal(isPublicAccessRoute(path), true, path);
  }
  assert.equal(getProductBackHref('/docs/numbers'), '/docs');
});

test('the personal activity page stays behind sign-in', () => {
  assert.equal(isPublicAccessRoute('/activity'), false);
});

test('every page but Home has a Back, the sidebar sections included', () => {
  assert.equal(getProductBackHref('/app'), null);
  for (const page of ['/activity', '/market', '/financier', '/profile']) assert.equal(getProductBackHref(page), '/app', page);
});

test('Back skips every copy of the page it is on, whatever case the address was written in', () => {
  const own = '/credit-passport/0xa045e8104bc066fff5bfc673abf354871edc03c5';
  const ownChecksum = '/credit-passport/0xA045E8104bc066FFF5bFC673ABf354871eDc03c5';
  assert.deepEqual(previousRoute(['/app', '/profile', ownChecksum, own], own), { route: '/profile', rest: ['/app'] });
  assert.deepEqual(previousRoute([ownChecksum], own), null);
  assert.deepEqual(previousRoute([], own), null);
  assert.deepEqual(previousRoute(['/market', own], own), { route: '/market', rest: [] });
});

test('Back never returns to the marketing site', () => {
  assert.deepEqual(previousRoute(['/', '/docs/numbers', '/credit-passport/0x1'], '/credit-passport/0x1'), null);
});
