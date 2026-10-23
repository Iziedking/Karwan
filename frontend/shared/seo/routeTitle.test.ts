import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { routeTitlesCopy } from '../i18n/messages/routeTitles';
import { documentTitle, routeTitleKey, titlePrepaintScript } from './routeTitle';

const APP = fileURLToPath(new URL('../../app', import.meta.url));

/// Every page route under app/, as a path with sample values for its params.
function pageRoutes(dir = APP, base = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = name.startsWith('[') ? 'sample' : name;
      out.push(...pageRoutes(full, `${base}/${segment}`));
    } else if (name === 'page.tsx') {
      out.push(base || '/');
    }
  }
  return out;
}

test('every page has its own tab title, or sets one on the server', () => {
  const routes = pageRoutes().filter((r) => r !== '/' && !r.startsWith('/admin'));
  assert.ok(routes.length > 50, 'routes found');
  const untitled = routes.filter((r) => routeTitleKey(r) === null);
  assert.deepEqual(untitled, []);
});

test('the finance desk is titled in the reader’s language', () => {
  assert.equal(routeTitleKey('/financier'), 'finance');
});

test('a page with server metadata is left to its own title', () => {
  for (const path of ['/r/sample', '/credit-passport/sample', '/feedback']) {
    assert.equal(routeTitleKey(path), 'server', path);
    const page = readFileSync(join(APP, path.replace('sample', path.startsWith('/r/') ? '[tag]' : '[address]'), 'page.tsx'), 'utf8');
    assert.match(page, /metadata|generateMetadata/, `${path} sets its title on the server`);
  }
});

test('the landing page and the console keep the site title, and trailing slashes match', () => {
  assert.equal(routeTitleKey('/'), null);
  assert.equal(routeTitleKey('/admin/deals'), null);
  assert.equal(routeTitleKey('/market/'), 'market');
  assert.equal(routeTitleKey('/deals/0xabc'), 'deal');
  assert.equal(documentTitle(routeTitlesCopy.ar.market), 'السوق · Karwan');
});

test('titles are short and never use an em dash', () => {
  for (const [locale, copy] of Object.entries(routeTitlesCopy)) {
    for (const [key, title] of Object.entries(copy)) {
      assert.ok(title.length > 0 && title.length <= 40, `${locale}.${key}`);
      assert.doesNotMatch(title, /—/, `${locale}.${key}`);
    }
  }
});

test('the tab is titled before the page draws, in the reader’s language', () => {
  const run = (path: string, cookie: string) => {
    const doc = { title: 'site', cookie };
    new Function('location', 'document', titlePrepaintScript())({ pathname: path }, doc);
    return doc.title;
  };
  assert.equal(run('/send', ''), 'Send · Karwan');
  assert.equal(run('/financier', 'karwan-locale=ar'), 'التمويل · Karwan');
  assert.equal(run('/deals/0xabc', 'x=1; karwan-locale=fr'), `${routeTitlesCopy.fr.deal} · Karwan`);
  assert.equal(run('/r/ada', ''), 'site');
  assert.equal(run('/', ''), 'site');
});
