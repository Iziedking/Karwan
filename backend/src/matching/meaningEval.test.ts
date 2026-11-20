import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MEANING_EVAL } from './meaningEval.js';

/// The eval set the probe runs on (view 95 phase 2 spec): 10 pairs that should
/// meet, 6 that should not, cross-language pairs among them.
///
///   npx tsx --test src/matching/meaningEval.test.ts

test('the eval set has 10 pairs that should meet and 6 that should not', () => {
  assert.equal(MEANING_EVAL.filter((p) => p.meet).length, 10);
  assert.equal(MEANING_EVAL.filter((p) => !p.meet).length, 6);
});

test('every pair has two sides and no pair is repeated', () => {
  const seen = new Set<string>();
  for (const p of MEANING_EVAL) {
    assert.ok(p.a.trim() && p.b.trim(), JSON.stringify(p));
    const key = `${p.a.toLowerCase()}|${p.b.toLowerCase()}`;
    assert.ok(!seen.has(key), key);
    seen.add(key);
  }
});

test('the cross-language pairs are named by language and all should meet', () => {
  const other = MEANING_EVAL.filter((p) => p.lang);
  assert.deepEqual(other.map((p) => p.lang).sort(), ['ar', 'fr', 'ha']);
  assert.ok(other.every((p) => p.meet));
});
