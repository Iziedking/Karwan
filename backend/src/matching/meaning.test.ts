import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cosine, meaningOn, meaningScore, modelKey, textHash, type MeaningSettings } from './meaning.js';

/// Meaning vectors (view 95 phase 2): how close two vectors are, as 0 to 100.
///
///   npx tsx --test src/matching/meaning.test.ts

const v = (...xs: number[]) => Float32Array.from(xs);
/// A unit vector at the given cosine to [1, 0].
const at = (c: number) => v(c, Math.sqrt(1 - c * c));

const on: MeaningSettings = {
  MEANING_VECTORS_ENABLED: true,
  BEDROCK_ENABLED: true,
  MEANING_MODEL: 'cohere.embed-v4:0',
  MEANING_THRESHOLD: 0.4,
  MEANING_DIMENSION: 1024,
};

test('meaningScore gives 0 at and below the threshold', () => {
  assert.equal(meaningScore(v(1, 0), v(1, 0), 1), 0);
  assert.equal(meaningScore(v(1, 0), at(0.5), 0.5), 0);
  assert.equal(meaningScore(v(1, 0), at(0.3), 0.5), 0);
});

test('meaningScore gives 100 at a similarity of 1', () => {
  assert.equal(meaningScore(v(1, 0), v(1, 0), 0.4), 100);
  assert.equal(meaningScore(v(3, 4), v(6, 8), 0.4), 100);
});

test('meaningScore rises between the threshold and 1', () => {
  assert.equal(meaningScore(v(1, 0), at(0.7), 0.4), 50);
});

test('a missing vector gives 0', () => {
  assert.equal(meaningScore(null, v(1, 0), 0.4), 0);
  assert.equal(meaningScore(v(1, 0), null, 0.4), 0);
});

test('a zero or mismatched vector gives 0, never NaN', () => {
  assert.equal(cosine(v(0, 0), v(1, 0)), 0);
  assert.equal(cosine(v(1, 0, 0), v(1, 0)), 0);
  assert.equal(meaningScore(v(0, 0), v(1, 0), 0.4), 0);
  assert.equal(meaningScore(v(1, 0, 0), v(1, 0), 0.4), 0);
  assert.equal(meaningScore(v(Number.NaN, 1), v(1, 0), 0.4), 0);
});

test('the switch counts as off without a model or a threshold', () => {
  assert.equal(meaningOn(on), true);
  assert.equal(meaningOn({ ...on, MEANING_VECTORS_ENABLED: false }), false);
  assert.equal(meaningOn({ ...on, BEDROCK_ENABLED: false }), false);
  assert.equal(meaningOn({ ...on, MEANING_MODEL: undefined }), false);
  assert.equal(meaningOn({ ...on, MEANING_THRESHOLD: undefined }), false);
});

test('modelKey names the model and the dimension, and is null when off', () => {
  assert.equal(modelKey(on), 'cohere.embed-v4:0@1024');
  assert.equal(modelKey({ ...on, MEANING_DIMENSION: 512 }), 'cohere.embed-v4:0@512');
  assert.equal(modelKey({ ...on, MEANING_MODEL: undefined }), null);
});

test('textHash ignores case and outer spaces', () => {
  assert.equal(textHash('  Tailor, Native Wears '), textHash('tailor, native wears'));
  assert.notEqual(textHash('tailor'), textHash('caterer'));
  assert.match(textHash('tailor'), /^[0-9a-f]{64}$/);
});
