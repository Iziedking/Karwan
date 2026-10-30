import assert from 'node:assert/strict';
import test from 'node:test';
import { dealReference, readDealReference, resolveDealReference } from './reference.js';

const A = '0xd68fe7d8eaf9cde16836c248d1df7d5811342d77ad987d0b83fb2ccf5e888172';
const B = '0x1234abcd' + 'f'.repeat(56);
const TWIN = '0xd68fe7d8' + '0'.repeat(56);

test('a deal reference is the first eight characters of the id, in two groups', () => {
  assert.equal(dealReference(A), 'D68F-E7D8');
  assert.equal(dealReference(A.toUpperCase().replace('0X', '0x')), 'D68F-E7D8');
  assert.equal(dealReference('not-an-id'), null);
});

test('every way of writing a reference reads the same', () => {
  for (const written of ['D68F-E7D8', 'd68fe7d8', '#D68F-E7D8', '0xd68fe7d8', ' Deal D68F-E7D8 ', 'd68f e7d8']) {
    assert.equal(readDealReference(written), 'd68fe7d8', written);
  }
});

test('a full id, a payment reference or other text is not a deal reference', () => {
  assert.equal(readDealReference(A), null);
  assert.equal(readDealReference('KRW-ABCD-EFGH-JKLM'), null);
  assert.equal(readDealReference('D68F-E7D'), null);
  assert.equal(readDealReference('hello there'), null);
});

test('a reference resolves only among the given deals', () => {
  assert.deepEqual(resolveDealReference('D68F-E7D8', [B, A]), { jobId: A });
  assert.deepEqual(resolveDealReference('D68F-E7D8', [B]), { missing: true });
  assert.deepEqual(resolveDealReference('D68F-E7D8', [A, TWIN, A]), { ambiguous: [A, TWIN] });
});
