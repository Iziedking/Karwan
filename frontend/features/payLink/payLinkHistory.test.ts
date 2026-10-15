import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const list = readFileSync(new URL('./PayLinkHistory.tsx', import.meta.url), 'utf8');

test('a request row says its state in a tinted label, its amount to the cent, and shows it opens', () => {
  // A pale label carries the state on its own ground; no dot to squint at.
  assert.doesNotMatch(list, /size-2 rounded-full/);
  assert.match(list, /rounded-full px-2\.5 py-0\.5/);
  assert.match(list, /walletAmount\(row\.amountUsdc\)/);
  assert.match(list, /<Icon name="chevron-right"/);
});

test('Show more fetches the next page from the server, so old requests stay reachable', () => {
  assert.match(list, /useInfiniteQuery\(/);
  assert.match(list, /getNextPageParam: \(last\) => last\.next/);
  assert.match(list, /fetchNextPage\(\)/);
  assert.doesNotMatch(list, /rows\.slice\(0, shown\)/, 'no reveal of rows already loaded');
  const api = readFileSync(new URL('../../core/api.ts', import.meta.url), 'utf8');
  assert.match(api, /listDepositRequests: \(page: RequestPage = \{\}\)/);
  assert.match(api, /paidDepositRequests: \(page: RequestPage = \{\}\)/);
});
