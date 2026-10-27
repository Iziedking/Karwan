import assert from 'node:assert/strict';
import test from 'node:test';
import { lowerCheck, lowerErrorKey } from './lowerOffer';

test('a new price must be a real amount below the offer now', () => {
  assert.equal(lowerCheck('260', '280'), 'ok');
  assert.equal(lowerCheck('280', '280'), 'NOT_LOWER');
  assert.equal(lowerCheck('300', '280'), 'NOT_LOWER');
  assert.equal(lowerCheck('', '280'), 'NOT_LOWER');
  assert.equal(lowerCheck('0', '280'), 'NOT_LOWER');
  assert.equal(lowerCheck('12.1234567', '280'), 'NOT_LOWER', 'USDC has six decimals');
});

test('the server refusals map to their own words, anything else to a retry', () => {
  for (const code of ['NOT_LOWER', 'LIMIT', 'CLOSED', 'BUSY'] as const) assert.equal(lowerErrorKey(code), code);
  assert.equal(lowerErrorKey('job-not-open'), 'other');
  assert.equal(lowerErrorKey(''), 'other');
});
