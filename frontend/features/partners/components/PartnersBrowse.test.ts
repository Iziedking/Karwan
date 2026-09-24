import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('business records grow with their facts and keep trust actions visible', () => {
  const source = readFileSync(new URL('./PartnersBrowse.tsx', import.meta.url), 'utf8');

  assert.match(source, /<article className="border-b/);
  assert.match(source, /<dl className="mt-6 grid/);
  assert.match(source, /copy\.viewTrustProfile/);
  assert.doesNotMatch(source, /h-\[400px\]|overflow-y-auto/);
});
