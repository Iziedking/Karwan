import assert from 'node:assert/strict';
import test from 'node:test';
import { getProductBackHref, isPublicAccessRoute, isPublicEditorialRoute } from './routes.js';

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
