import assert from 'node:assert/strict';
import test from 'node:test';
import { paged } from './paged';

///   npx tsx --test shared/utils/paged.test.ts

const fourteen = Array.from({ length: 14 }, (_, i) => i + 1);

test('the first page shows rows one to five, with only Next', () => {
  const p = paged(fourteen, 0);
  assert.deepEqual(p.rows, [1, 2, 3, 4, 5]);
  assert.deepEqual([p.from, p.to, p.total, p.pages, p.hasPrev, p.hasNext], [1, 5, 14, 3, false, true]);
});

test('the last page holds what is left, with only Previous', () => {
  const p = paged(fourteen, 2);
  assert.deepEqual(p.rows, [11, 12, 13, 14]);
  assert.deepEqual([p.from, p.to, p.hasPrev, p.hasNext], [11, 14, true, false]);
});

test('a page past the end falls back to the last page with rows', () => {
  assert.equal(paged(fourteen, 9).page, 2);
  assert.equal(paged(fourteen.slice(0, 5), 1).page, 0);
});

test('an empty list is one empty page', () => {
  const p = paged([], 0);
  assert.deepEqual([p.rows.length, p.from, p.to, p.pages, p.hasPrev, p.hasNext], [0, 0, 0, 1, false, false]);
});
