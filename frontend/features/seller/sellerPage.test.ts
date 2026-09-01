import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Seller Desk does not repeat the Open Deals profile band', () => {
  const page = readFileSync(new URL('../../app/seller/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /PendingDealsBand/);
});
