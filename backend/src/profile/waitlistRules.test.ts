import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEmailList } from './waitlistRules.js';

test('reads a pasted list with commas, spaces, new lines and mixed case', () => {
  const r = parseEmailList('Ada@Example.com, bob@example.com\n\n  carol@example.org;ada@example.com');
  assert.deepEqual(r.valid, ['ada@example.com', 'bob@example.com', 'carol@example.org']);
  assert.deepEqual(r.invalid, []);
});

test('keeps the entries that are not emails aside so nothing is silently dropped', () => {
  const r = parseEmailList('good@example.com not-an-email @missing.com');
  assert.deepEqual(r.valid, ['good@example.com']);
  assert.deepEqual(r.invalid, ['not-an-email', '@missing.com']);
});
