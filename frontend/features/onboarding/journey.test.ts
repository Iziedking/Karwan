import assert from 'node:assert/strict';
import test from 'node:test';
import {
  onboardingJourney,
  onboardingProgress,
  stepAfterAuthentication,
} from './journey';

test('individual onboarding includes an explicit role decision', () => {
  assert.deepEqual(onboardingJourney('person'), [
    'accountType',
    'connect',
    'role',
    'profile',
    'getReady',
  ]);
  assert.deepEqual(onboardingProgress('role', 'person'), { current: 3, total: 5 });
  assert.deepEqual(onboardingProgress('profile', 'person'), { current: 4, total: 5 });
  assert.equal(stepAfterAuthentication('person'), 'role');
});

test('business onboarding skips the redundant role decision', () => {
  assert.deepEqual(onboardingJourney('business'), [
    'accountType',
    'connect',
    'profile',
    'getReady',
  ]);
  assert.deepEqual(onboardingProgress('profile', 'business'), { current: 3, total: 4 });
  assert.equal(stepAfterAuthentication('business'), 'profile');
});

test('the unselected journey never skips the individual role decision', () => {
  assert.equal(stepAfterAuthentication(null), 'role');
  assert.deepEqual(onboardingProgress('accountType', null), { current: 1, total: 5 });
});
