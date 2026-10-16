import assert from 'node:assert/strict';
import test from 'node:test';
import { maliciousCountOf, type LinkOffense } from './linkOffenses.js';

const base: LinkOffense = { address: '0xa', count: 2, lastAt: 1, lastVerdict: 'suspicious', lastSurface: 'chat', lastReasons: [], seen: [] };

test('suspicious links alone count for nothing', () => {
  assert.equal(maliciousCountOf(base), 0);
  assert.equal(maliciousCountOf(undefined), 0);
});

test('malicious links are counted on their own', () => {
  assert.equal(maliciousCountOf({ ...base, count: 3, malicious: 1 }), 1);
});

test('a record from before the split counts one malicious link at most, and only if the last verdict was malicious', () => {
  assert.equal(maliciousCountOf({ ...base, count: 3, lastVerdict: 'malicious' }), 1);
});
