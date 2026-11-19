import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { buildNavigateAction, NAVIGATE_DESTINATIONS } from './actions.js';
import { GUIDE_PAGES, guidePagesText, NOT_GUIDED, pageOfPoint, pathMatches, UNMOUNTED_MARKS } from './guidePages.js';

/// Aman is the only guide (view 57, 17 Nov): it has to know every page a
/// person can open and every part it can point at, and this test keeps the
/// list honest as pages come and go.

const FRONTEND = join(import.meta.dirname, '..', '..', '..', 'frontend');
const SKIP = new Set(['node_modules', '.next', 'out', 'dist']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function frontendPages(): string[] {
  const app = join(FRONTEND, 'app');
  return walk(app)
    .filter((f) => f.endsWith(`${sep}page.tsx`))
    .map((f) => {
      const parts = relative(app, f).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
      return `/${parts.join('/')}`;
    })
    .filter((p) => !/^\/(admin|api)(\/|$)/.test(p));
}

function marks(): { exact: Set<string>; prefixes: Set<string> } {
  const exact = new Set<string>();
  const prefixes = new Set<string>();
  for (const root of ['app', 'features', 'shared']) {
    for (const file of walk(join(FRONTEND, root)).filter((f) => f.endsWith('.tsx'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/data-guide="([^"${}]+)"/g)) exact.add(m[1]!);
      for (const m of src.matchAll(/dataGuide="([^"${}]+)"/g)) exact.add(m[1]!);
      for (const m of src.matchAll(/data-guide=\{`([^`$]*)\$\{/g)) prefixes.add(m[1]!);
      // A row that marks itself through its `guide` prop (view 57, 19 Nov).
      for (const m of src.matchAll(/[\s{(]guide="([a-z0-9-]+)"/g)) exact.add(m[1]!);
      for (const m of src.matchAll(/[\s{(]guide=\{`([^`$]*)\$\{/g)) prefixes.add(m[1]!);
    }
  }
  return { exact, prefixes };
}

const allPoints = () => GUIDE_PAGES.flatMap((p) => Object.keys(p.points));

test('every page is guided or has a reason, never both', () => {
  const guided = new Set(GUIDE_PAGES.map((p) => p.path));
  for (const page of frontendPages()) {
    const listed = Number(guided.has(page)) + Number(page in NOT_GUIDED);
    assert.equal(listed, 1, `${page} must be in exactly one of GUIDE_PAGES or NOT_GUIDED`);
  }
});

test('no list names a page that does not exist', () => {
  const pages = new Set(frontendPages());
  for (const path of [...GUIDE_PAGES.map((p) => p.path), ...Object.keys(NOT_GUIDED)]) {
    assert.ok(pages.has(path), `${path} has no page.tsx`);
  }
  assert.equal(new Set(GUIDE_PAGES.map((p) => p.path)).size, GUIDE_PAGES.length, 'a page is listed twice');
});

test('every navigate destination opens a guided page', () => {
  const sample = { jobId: '0xabc', listingId: 'l1', token: '0f8e3b2a-1c4d-4e5f-9a6b-7c8d9e0f1a2b', address: `0x${'1'.repeat(40)}` };
  for (const destination of NAVIGATE_DESTINATIONS) {
    const built = buildNavigateAction({ destination, ...sample });
    assert.ok(!('error' in built), `${destination} did not build`);
    if ('error' in built) continue;
    assert.ok(GUIDE_PAGES.some((p) => pathMatches(p.path, built.href)), `${destination} opens ${built.href}, which no guided page covers`);
  }
});

test('every mark on the page is a point and every point is on the page', () => {
  const { exact, prefixes } = marks();
  const points = new Set(allPoints());
  for (const mark of exact) {
    assert.ok(points.has(mark) || mark in UNMOUNTED_MARKS, `data-guide="${mark}" is not a point`);
  }
  for (const point of points) {
    assert.ok(exact.has(point) || [...prefixes].some((p) => p && point.startsWith(p)), `point ${point} is not on any page`);
    assert.ok(!(point in UNMOUNTED_MARKS), `${point} is both a point and unmounted`);
  }
  for (const prefix of prefixes) assert.ok([...points].some((p) => p.startsWith(prefix)), `no point for marks starting ${prefix}`);
  for (const mark of Object.keys(UNMOUNTED_MARKS)) assert.ok(exact.has(mark), `${mark} is no longer in the code; drop it from UNMOUNTED_MARKS`);
});

test('a point lives on one page and has a plain id', () => {
  const points = allPoints();
  assert.equal(new Set(points).size, points.length);
  for (const id of points) assert.match(id, /^[a-z0-9-]{2,40}$/);
  for (const page of GUIDE_PAGES) for (const id of Object.keys(page.points)) assert.equal(pageOfPoint(id), page.path);
  assert.equal(pageOfPoint('nope'), null);
});

test('every reason and every page says something', () => {
  for (const [path, why] of [...Object.entries(NOT_GUIDED), ...Object.entries(UNMOUNTED_MARKS)]) assert.ok(why.length >= 10, path);
  for (const page of GUIDE_PAGES) {
    assert.ok(page.purpose.length >= 10, page.path);
    for (const [id, what] of Object.entries(page.points)) assert.ok(what.length >= 10, id);
    assert.ok(!/—/.test(page.purpose + page.can.join(' ') + Object.values(page.points).join(' ')), `${page.path} has an em dash`);
  }
});

test('a page pattern matches its own links and only those', () => {
  assert.ok(pathMatches('/deals/[id]', '/deals/0xabc?point=x'));
  assert.ok(pathMatches('/app', '/app?tour=1'));
  assert.ok(pathMatches('/profile', '/profile#agents'));
  assert.ok(!pathMatches('/deals/[id]', '/deals'));
  assert.ok(!pathMatches('/deals', '/deals/0xabc'));
  assert.ok(!pathMatches('/app', '/apple'));
});

test('every point has a line in each of the 5 languages', () => {
  const src = readFileSync(join(FRONTEND, 'shared', 'i18n', 'messages', 'pointLines.ts'), 'utf8');
  const blocks = new Map<string, Set<string>>();
  for (const m of src.matchAll(/const (en|fr|ar|hi|sw)\b[^=]*=\s*\{([\s\S]*?)\n\};/g)) {
    blocks.set(m[1]!, new Set([...m[2]!.matchAll(/^\s*'?([a-z0-9-]+)'?:/gm)].map((k) => k[1]!)));
  }
  assert.deepEqual([...blocks.keys()].sort(), ['ar', 'en', 'fr', 'hi', 'sw']);
  for (const id of allPoints()) {
    for (const [locale, keys] of blocks) assert.ok(keys.has(id), `${locale} has no line for ${id}`);
  }
});

test('the guide text names every page and every point', () => {
  const text = guidePagesText();
  for (const page of GUIDE_PAGES) {
    assert.ok(text.includes(page.path), page.path);
    for (const id of Object.keys(page.points)) assert.ok(text.includes(id), id);
  }
});
