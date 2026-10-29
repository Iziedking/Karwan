import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MARKET_REDIRECTS } from './marketRedirects.mjs';

/// Old trade hubs and parked pages redirect into the one market (view 17), so
/// links in emails, chats and bookmarks keep working.
///
///   npx tsx --test shared/utils/marketRedirects.test.ts

test('every old place redirects to its new place, temporarily', () => {
  assert.deepEqual(
    MARKET_REDIRECTS.map((r) => [r.source, r.destination, r.permanent]),
    [
      ['/p2p', '/market?view=yours', false],
      ['/b2b', '/market?view=yours', false],
      ['/p2p/requests', '/market?view=yours&list=requests', false],
      ['/p2p/offers', '/market?view=yours&list=offers', false],
      ['/listings', '/market', false],
      ['/partners', '/market?scope=business', false],
      ['/supply', '/seller', false],
      ['/onboarding', '/setup', false],
    ],
  );
});

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OLD = /['"`]\/(p2p|b2b|partners|supply)(\/[a-z]+)?(['"`?#]|$)/;
const SKIP = [/\.test\.tsx?$/, /marketRedirects\.mjs$/, /[\\/]features[\\/]partners[\\/]/, /[\\/]shared[\\/]i18n[\\/]/];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : files(full);
    return /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
  });
}

test('nothing in the app still links to an old place', () => {
  const hits = ['app', 'features', 'shared']
    .flatMap((d) => files(join(ROOT, d)))
    .filter((f) => !SKIP.some((re) => re.test(f)))
    .flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => [f.slice(ROOT.length), i + 1, line.trim()] as const)
        .filter(([, , line]) => OLD.test(line) && !line.startsWith('//') && !line.startsWith('*')),
    );
  assert.deepEqual(hits, []);
});
