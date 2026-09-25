import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTitle } from './requestTitle.js';

test('a request is named by the first line of its brief, never by a hash', () => {
  assert.equal(requestTitle('Logo for my bakery\nSVG and PNG'), 'Logo for my bakery');
  assert.equal(requestTitle('   '), null);
  assert.equal(requestTitle(null), null);
  assert.equal(requestTitle('a'.repeat(90))?.length, 80);
});
