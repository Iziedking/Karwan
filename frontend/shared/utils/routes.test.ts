import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicAccessRoute, isPublicEditorialRoute } from './routes.js';

test('the public numbers page never asks a visitor to sign in', () => {
  assert.equal(isPublicEditorialRoute('/activity/all-time'), true);
  assert.equal(isPublicAccessRoute('/activity/all-time'), true);
});

test('the personal activity page stays behind sign-in', () => {
  assert.equal(isPublicAccessRoute('/activity'), false);
});
