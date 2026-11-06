import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

/// Two modules whose names differ only by case (dealRoute.ts and DealRoute.tsx)
/// are two files on Linux and one on Windows and macOS, where an import can load
/// the wrong one. Home crashed on a Windows dev machine this way (6 Nov 2026).
function clashes(dir: string, out: string[] = []): string[] {
  const seen = new Map<string, string>();
  for (const name of readdirSync(join(root, dir))) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      clashes(rel, out);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx|mjs)$/.test(name)) continue;
    const key = name.replace(/\.(test\.)?(ts|tsx|js|jsx|mjs)$/, (m, t) => (t ? '.test' : '')).toLowerCase();
    const other = seen.get(key);
    if (other) out.push(`${join(dir, other)} and ${name}`);
    else seen.set(key, name);
  }
  return out;
}

test('no two modules in one folder differ only by case', () => {
  assert.deepEqual(['app', 'core', 'features', 'shared'].flatMap((d) => clashes(d)), []);
});
