import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the money summary card has no decorative lime top strip', () => {
  const source = readFileSync(new URL('./MoneyStrip.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /absolute inset-x-0 top-0 h-1 bg-\[var\(--lp-accent\)\]/);
});
