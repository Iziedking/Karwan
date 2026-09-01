import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the passport shows a public back control and positions the ladder from the held tier', () => {
  const source = readFileSync(new URL('./CreditPassport.tsx', import.meta.url), 'utf8');

  assert.match(source, /<BackButton tone="adaptive" showOnPublic fallbackHref="\/partners" \/>/);
  assert.match(source, /tierLadderPosition\(tier as ProgressTier\)/);
  assert.doesNotMatch(source, /\(score \/ 1000\) \* 100/);
});
