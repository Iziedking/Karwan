import assert from 'node:assert/strict';
import test from 'node:test';
import { pointLines } from './pointLines';

/// The line beside a lit part comes from our copy, never from the model (view 57, 17 Nov).

test('every language has a line for every point, none empty, no dashes', () => {
  const keys = Object.keys(pointLines.en).sort();
  assert.ok(keys.length >= 40);
  for (const [locale, lines] of Object.entries(pointLines)) {
    assert.deepEqual(Object.keys(lines).sort(), keys, locale);
    for (const [id, line] of Object.entries(lines)) {
      assert.ok(line.trim().length > 0, `${locale} ${id}`);
      assert.ok(!/[—–]/.test(line), `${locale} ${id}`);
    }
  }
});

test('the five languages are there', () => {
  assert.deepEqual(Object.keys(pointLines).sort(), ['ar', 'en', 'fr', 'hi', 'sw']);
});
