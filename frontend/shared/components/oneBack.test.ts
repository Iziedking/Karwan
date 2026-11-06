import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) out.push(path);
  }
  return out;
}

test('a page that draws its own Back hides the frame\'s copy, so there is only one Back', () => {
  const doubled = [...sources(join(root, 'app')), ...sources(join(root, 'features'))]
    .filter((file) => /<BackButton\b/.test(readFileSync(file, 'utf8')) && !/data-own-back/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(root, file).replace(/\\/g, '/'));
  assert.deepEqual(doubled, []);
});
