import assert from 'node:assert/strict';
import test from 'node:test';
import { recordFirst } from './recordFirst';

///   npx tsx --test features/record/recordFirst.test.ts

test('an own wallet with record steps still missing sends them before a step that moves no money itself', () => {
  assert.equal(recordFirst({ available: true, complete: false, steps: [{ data: '0x' }] }), true);
});

test('a complete record, a held wallet, a network without records or an unknown status asks nothing first', () => {
  assert.equal(recordFirst({ available: true, complete: true, steps: [] }), false);
  assert.equal(recordFirst({ available: true, complete: false }), false);
  assert.equal(recordFirst({ available: true, complete: false, steps: [] }), false);
  assert.equal(recordFirst({ available: false }), false);
  assert.equal(recordFirst(null), false);
});
