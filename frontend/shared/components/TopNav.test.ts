import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the open profile trigger stays above its dismiss layer and toggles closed', () => {
  const source = readFileSync(new URL('./TopNav.tsx', import.meta.url), 'utf8');

  assert.match(source, /onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/);
  assert.match(source, /open && 'z-\[51\]'/);
  assert.match(source, /data-preferences-dismiss-layer/);
});
