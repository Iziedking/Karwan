import assert from 'node:assert/strict';
import test from 'node:test';
import { MARKET_PAGE_SIZE, pageItems, pageWindow } from './pagination';

const items = Array.from({ length: 94 }, (_, i) => i);

test('a page holds twelve cards and reports its place in the whole list', () => {
  const first = pageItems(items, 1);
  assert.equal(MARKET_PAGE_SIZE, 12);
  assert.deepEqual(first.items, items.slice(0, 12));
  assert.deepEqual([first.page, first.pageCount, first.from, first.to, first.total], [1, 8, 1, 12, 94]);
  const last = pageItems(items, 8);
  assert.deepEqual([last.from, last.to], [85, 94]);
});

test('a page past the end, or below one, lands on a real page', () => {
  assert.equal(pageItems(items, 40).page, 8);
  assert.equal(pageItems(items, 0).page, 1);
  assert.deepEqual(pageItems([], 3), { items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
});

test('the pager shows every page when few, and first, last and neighbours when many', () => {
  assert.deepEqual(pageWindow(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageWindow(1, 8), [1, 2, 3, 'gap', 8]);
  assert.deepEqual(pageWindow(5, 8), [1, 'gap', 4, 5, 6, 'gap', 8]);
  assert.deepEqual(pageWindow(8, 8), [1, 'gap', 6, 7, 8]);
});
