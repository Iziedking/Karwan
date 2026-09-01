import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('business cards use one height and keep variable facts scrollable', () => {
  const source = readFileSync(new URL('./PartnersBrowse.tsx', import.meta.url), 'utf8');

  assert.match(source, /<article className="h-\[400px\] sm:h-\[430px\]">/);
  assert.match(source, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(source, /role="region"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /grid shrink-0 gap-2/);
});
