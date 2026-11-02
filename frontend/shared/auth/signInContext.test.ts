import assert from 'node:assert/strict';
import test from 'node:test';
import { signInContext } from './signInContext';

test('sign-in reassurance follows the destination payment model', () => {
  assert.equal(signInContext('/deposit/request/abc?amount=5#review'), 'direct');
  assert.equal(signInContext('/send'), 'direct');
  assert.equal(signInContext('/deals/123?tab=terms'), 'deal');
  for (const path of [null, '/app', '/messages', '/requesting', '//evil.test', '/start?next=/deals']) assert.equal(signInContext(path), null);
});
