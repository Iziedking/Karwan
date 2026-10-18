import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// One request form and one offer form for every account (view 17): a
/// business uses /buyer and /seller like anyone, with business wording inside.
///
///   npx tsx --test features/market/oneForm.test.ts

const page = (path: string) => readFileSync(new URL(`../../app/${path}/page.tsx`, import.meta.url), 'utf8');

test('the request and offer pages never send a business somewhere else', () => {
  for (const path of ['buyer', 'seller']) {
    const source = page(path);
    assert.doesNotMatch(source, /BusinessTradeDesk/, path);
    assert.doesNotMatch(source, /\/supply|\/partners/, path);
    assert.doesNotMatch(source, /if \(isBusinessWorkspace\) return/, path);
  }
});

test('the request form links sellers to the one offer form', () => {
  const form = readFileSync(new URL('../buyer/components/PostJobForm.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(form, /\/supply/);
});
