import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { countVectors, deleteVectorsOf, getVector, listVectors, putVector, resetMeaningVectorsForTests, type StoredVector } from './meaningVectors.js';

/// Meaning vectors kept beside the seller index (view 95 phase 2), memory store.
///
///   npx tsx --test src/db/meaningVectors.test.ts

const row = (over: Partial<StoredVector> = {}): StoredVector => ({
  kind: 'seller',
  ref: '0xaaa',
  model: 'm@4',
  owner: '0xaaa',
  textHash: 'h1',
  vector: Float32Array.from([0.1, 0.2, 0.3, 0.4]),
  updatedAt: 1,
  ...over,
});

beforeEach(() => resetMeaningVectorsForTests());

test('a saved vector reads back', async () => {
  await putVector(row());
  const got = await getVector('seller', '0xaaa', 'm@4');
  assert.ok(got);
  assert.equal(got.textHash, 'h1');
  assert.deepEqual([...got.vector], [...Float32Array.from([0.1, 0.2, 0.3, 0.4])]);
});

test('saving the same key again replaces it', async () => {
  await putVector(row());
  await putVector(row({ textHash: 'h2', vector: Float32Array.from([1, 0, 0, 0]), updatedAt: 2 }));
  const got = await getVector('seller', '0xaaa', 'm@4');
  assert.equal(got?.textHash, 'h2');
  assert.equal(got?.updatedAt, 2);
  assert.equal(await countVectors('seller', 'm@4'), 1);
});

test('listing returns only the asked kind and model', async () => {
  await putVector(row());
  await putVector(row({ ref: '0xbbb', owner: '0xbbb', model: 'old@4' }));
  await putVector(row({ kind: 'request', ref: 'job-1' }));
  const got = await listVectors('seller', 'm@4');
  assert.deepEqual(got.map((x) => x.ref), ['0xaaa']);
});

test('deleting an owner removes every kind of theirs and leaves others', async () => {
  await putVector(row());
  await putVector(row({ kind: 'request', ref: 'job-1' }));
  await putVector(row({ kind: 'need', ref: 'order-1' }));
  await putVector(row({ ref: '0xbbb', owner: '0xbbb' }));
  assert.equal(await deleteVectorsOf('0xAAA'), 3);
  assert.equal(await getVector('request', 'job-1', 'm@4'), null);
  assert.ok(await getVector('seller', '0xbbb', 'm@4'));
});
