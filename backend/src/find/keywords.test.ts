import assert from 'node:assert/strict';
import test from 'node:test';
import { keywordsOf } from './keywords.js';

/// The words find and the rating read match on, in any script (view 93).
///
///   npx tsx --test src/find/keywords.test.ts

test('Latin words are split as before', () => {
  assert.deepEqual(keywordsOf('Made-to-measure SUIT for a wedding'), ['made', 'measure', 'suit', 'for', 'wedding']);
});

test('Hausa letters stay inside their words', () => {
  assert.deepEqual(keywordsOf('Ɗinkin babbar riga'), ['ɗinkin', 'babbar', 'riga']);
});

test('Arabic and other scripts are kept', () => {
  assert.deepEqual(keywordsOf('خياطة بدلة'), ['خياطة', 'بدلة']);
  assert.deepEqual(keywordsOf('西装 定制'), ['西装', '定制']);
});
