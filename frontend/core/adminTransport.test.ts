import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialsForApiRequest } from './adminTransport';

test('desk requests carry only the admin address’s own cookies, never the customer session', () => {
  assert.equal(credentialsForApiRequest({ 'x-admin-token': 'operator' }, 'include'), 'same-origin');
  assert.equal(credentialsForApiRequest({ 'X-Admin-Token': 'operator' }, undefined), 'same-origin');
});

test('ordinary application requests retain cookie credentials', () => {
  assert.equal(credentialsForApiRequest(undefined, undefined), 'include');
  assert.equal(credentialsForApiRequest({ authorization: 'Bearer user' }, 'same-origin'), 'same-origin');
});
