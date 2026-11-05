import assert from 'node:assert/strict';
import test from 'node:test';
import { readingMs } from './guideTiming';

///   npx tsx --test features/setup/guideTiming.test.ts

test('a guide line stays long enough to read twice, between 4 and 9 seconds', () => {
  assert.equal(readingMs(3), 4_000);
  assert.equal(readingMs(12), 5_600);
  assert.equal(readingMs(40), 9_000);
});
