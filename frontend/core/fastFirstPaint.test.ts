import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// The site felt slow and flashed an older look before settling (owner,
/// 8 Nov 2026). These keep the fixes in place.
///
///   npx tsx --test core/fastFirstPaint.test.ts

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('a read carries no content type, so the browser asks the API no leave before it', () => {
  const api = read('./api.ts');
  assert.match(api, /\.\.\.\(init\?\.body != null \? \{ 'content-type': 'application\/json' \} : \{\}\)/);
  assert.doesNotMatch(api, /const headers = \{ 'content-type': 'application\/json', \.\.\.\(init\?\.headers/);
});

test('the page opens its connection to the API while it loads', () => {
  const layout = read('../app/layout.tsx');
  assert.match(layout, /<link rel="preconnect" href=\{API_ORIGIN\} crossOrigin="use-credentials" \/>/);
  assert.doesNotMatch(layout, /await cookies\(\)/, 'the layout stays static');
});

test('a slow route shows the one quiet loader, never the shape of an older page', () => {
  for (const route of ['activity', 'buyer', 'seller', 'jobs/[id]']) {
    const s = read(`../app/${route}/loading.tsx`);
    assert.match(s, /RouteLoading/, route);
    assert.doesNotMatch(s, /--color-line|Shimmer|grid-cols/, route);
  }
});
