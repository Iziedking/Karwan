import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

function productFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (/admin|node_modules|\.test\./.test(rel)) continue;
    if (statSync(join(root, rel)).isDirectory()) productFiles(rel, out);
    else if (rel.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

test('the product reads in Inter with solid secondary ink', () => {
  const tokens = read('app/design-tokens.css');
  assert.match(tokens, /--font-sans: var\(--font-inter\)/);
  assert.doesNotMatch(tokens, /--ink-secondary: color-mix/);
  assert.match(read('app/layout.tsx'), /Inter\(/);
});

test('no product text is smaller than 13px, and only references sit at 13px', () => {
  const small = /text-\[(?:[0-9]|1[0-2](?:\.\d+)?)px\]|\btext-xs\b|font-light|font-extralight/;
  const offenders = ['app', 'features', 'shared'].flatMap((d) => productFiles(d)).filter((f) => small.test(read(f)));
  assert.deepEqual(offenders, []);
});
