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

test('every setting has a plain line, short enough to read in a glance (view 57, 19 Nov)', () => {
  const ids = ['settings-language', 'settings-theme', 'settings-sound', 'settings-alerts', 'settings-reach', 'settings-passport',
    'settings-publish-deals', 'settings-publish-history', 'settings-agent-jobs', 'settings-memory', 'settings-guide',
    'settings-currency', 'settings-trade-with', 'settings-agent-power',
    ...['offers', 'bargain', 'agree', 'lock', 'find', 'data', 'brief'].map((n) => `settings-agent-${n}`)];
  const en = pointLines.en as Record<string, string>;
  for (const id of ids) {
    assert.ok(en[id], `${id} has no line`);
    assert.ok(en[id]!.length <= 140, `${id} is ${en[id]!.length} characters`);
  }
});
