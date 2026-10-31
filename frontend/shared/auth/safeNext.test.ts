import assert from 'node:assert/strict';
import test from 'node:test';
import { safeNext } from './safeNext';

///   npx tsx --test shared/auth/safeNext.test.ts

test('only a path on this site is a place to go back to', () => {
  assert.equal(safeNext('/order/lst_1'), '/order/lst_1');
  assert.equal(safeNext('/jobs/0xabc?x=1'), '/jobs/0xabc?x=1');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', '', null, undefined, '/start', '/start?next=/x', '/' + 'a'.repeat(600), '/x\nLocation: y']) {
    assert.equal(safeNext(bad), null, String(bad));
  }
});
