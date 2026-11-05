import assert from 'node:assert/strict';
import test from 'node:test';
import { forgetSeller } from './judgedSet.js';

///   npx tsx --test src/agents/judgedSet.test.ts

test('forgetSeller drops the seller only from the named requests', () => {
  const judged = new Map([
    ['0xAA', new Set(['0xs1', '0xs2'])],
    ['0xbb', new Set(['0xs1'])],
    ['0xcc', new Set(['0xs2'])],
  ]);
  assert.equal(forgetSeller(judged, '0xS1', ['0xaa', '0xcc']), 1);
  assert.deepEqual([...judged.get('0xAA')!], ['0xs2']);
  assert.deepEqual([...judged.get('0xbb')!], ['0xs1']);
  assert.deepEqual([...judged.get('0xcc')!], ['0xs2']);
  assert.equal(forgetSeller(judged, '0xs1', []), 0);
});
