import test from 'node:test';
import assert from 'node:assert/strict';
import { profilePagesCopy } from './profilePages';

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k));
}

function textAt(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((at, k) => (at as Record<string, unknown> | undefined)?.[k], value);
}

test('everyLanguageSaysEveryProfileWord', () => {
  const want = keysOf(profilePagesCopy.en).sort();
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    assert.deepEqual(keysOf(profilePagesCopy[locale]).sort(), want, locale);
    for (const key of want) assert.ok(String(textAt(profilePagesCopy[locale], key)).trim(), `${locale} ${key}`);
  }
});

test('theProfileWordsHaveNoDashes', () => {
  for (const [locale, copy] of Object.entries(profilePagesCopy)) {
    for (const key of keysOf(copy)) assert.ok(!String(textAt(copy, key)).includes('—'), `${locale} ${key}`);
  }
});
