import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/core/api';
import { worldStepFrom } from './agentWorldStep';

test('a World ID refusal on choose becomes the check step, with its reason and skip rule', () => {
  const err = new ApiError(409, 'Confirm with World ID', undefined, 'WORLD_ID_REQUIRED', { code: 'WORLD_ID_REQUIRED', reason: 'large_deal', skipAllowed: true });
  assert.deepEqual(worldStepFrom(err), { reason: 'large_deal', skipAllowed: true });
});

test('an unknown reason is dropped and skip defaults to off', () => {
  const err = new ApiError(409, 'x', undefined, 'WORLD_ID_REQUIRED', { reason: 'something-else' });
  assert.deepEqual(worldStepFrom(err), { reason: null, skipAllowed: false });
});

test('every other failure is not a World ID step', () => {
  assert.equal(worldStepFrom(new ApiError(409, 'x', undefined, 'PRICE_CHANGED')), null);
  assert.equal(worldStepFrom(new Error('x')), null);
});
