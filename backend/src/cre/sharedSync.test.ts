import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '../../../cre/shared');
const copy = path.resolve(here, 'shared');
const HEADER = '// Copied from cre/shared by scripts/cre-shared-sync.mjs. Edit cre/shared, then run the script.\n';

test('the backend copy of cre/shared is byte for byte the workflow source', () => {
  const files = readdirSync(source).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
  assert.ok(files.length > 0);
  assert.deepEqual(readdirSync(copy).filter((f) => f.endsWith('.ts')).sort(), files);
  for (const f of files) {
    assert.equal(readFileSync(path.join(copy, f), 'utf8'), HEADER + readFileSync(path.join(source, f), 'utf8'), `${f} drifted`);
  }
});
