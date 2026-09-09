import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMilestoneSplit } from './validation';

test('accepts the supported milestone splits', () => {
  assert.deepEqual(parseMilestoneSplit(' 50, 50 '), [50, 50]);
  assert.deepEqual(parseMilestoneSplit('100'), [100]);
  assert.deepEqual(parseMilestoneSplit('20,20,20,20,20'), [20,20,20,20,20]);
});

test('rejects malformed, fractional, negative, empty and excessive splits', () => {
  for (const value of ['', '100,', '100,bogus', '0,100', '150,-50', '50.5,49.5', '1e2', '40,40', '20,20,20,20,10,10']) {
    assert.equal(parseMilestoneSplit(value), null, value);
  }
});
