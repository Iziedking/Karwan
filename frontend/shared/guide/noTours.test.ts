import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/// Aman is the only guide (view 57, 17 Nov): no page tour, no way to start one.

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith('noTours.test.ts')) acc.push(full);
  }
  return acc;
}

test('no page mounts a tour and nothing starts one', () => {
  for (const file of ['app', 'features', 'shared', 'core'].flatMap((root) => walk(root))) {
    const src = readFileSync(file, 'utf8');
    for (const banned of ['PageTour', 'startTour', 'registerTour', 'tour=1', '?tour', 'guide/tours']) {
      assert.ok(!src.includes(banned), `${file} still has ${banned}`);
    }
  }
});

test('the tour check is gone from the scripts and from CI', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
  assert.ok(!('check:tours' in pkg.scripts));
  assert.ok(!readFileSync(join('..', '.github', 'workflows', 'ci.yml'), 'utf8').includes('check:tours'));
});
