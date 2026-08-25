import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialsForApiRequest } from './adminTransport';

test('operator requests never inherit the customer browser session', () => {
  assert.equal(credentialsForApiRequest({ 'x-admin-token': 'operator' }, 'include'), 'omit');
  assert.equal(credentialsForApiRequest({ 'X-Admin-Token': 'operator' }, undefined), 'omit');
});

test('ordinary application requests retain cookie credentials', () => {
  assert.equal(credentialsForApiRequest(undefined, undefined), 'include');
  assert.equal(credentialsForApiRequest({ authorization: 'Bearer user' }, 'same-origin'), 'same-origin');
});
