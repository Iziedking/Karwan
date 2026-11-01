import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { pointImportsAtLocale, stripToLocale, languageRecords, LOCALES } = require('./localeLoader.cjs') as {
  pointImportsAtLocale: (source: string, locale: string) => string;
  stripToLocale: (source: string, locale: string) => { source: string; found: number };
  languageRecords: (source: string) => Array<Array<{ locale: string; value: string }>>;
  LOCALES: string[];
};
const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(here, 'messages', name), 'utf8');

/// The feature files a language file imports for their values.
function featureImports(languageFile: string): string[] {
  return [...pointImportsAtLocale(read(languageFile), 'en').matchAll(/from '\.\/([A-Za-z]+)\?only=en'/g)].map((m) => m[1]);
}

test('each language file asks its feature files for its own language only', () => {
  const fr = pointImportsAtLocale("import { marketShopCopy } from './marketShop';\nimport type { X } from './editorial';\nimport { en } from './en';\n", 'fr');
  assert.match(fr, /from '\.\/marketShop\?only=fr'/);
  assert.match(fr, /from '\.\/editorial'/);
  assert.match(fr, /from '\.\/en'/);
});

test('a record written inline or by name keeps one language', () => {
  const inline = stripToLocale("export const c: Record<'en' | 'fr', T> = {\n  en: { a: 'Buy' },\n  fr: { a: 'Acheter' },\n};\n", 'en');
  assert.equal(inline.found, 1);
  assert.match(inline.source, /en: \{ a: 'Buy' \}/);
  assert.match(inline.source, /fr: undefined/);
  const named = stripToLocale("const en: T = { a: 'Buy' };\nconst sw: T = { a: 'Nunua' };\nexport const c: Record<'en' | 'sw', T> = { en, sw };\n", 'sw');
  assert.match(named.source, /\{ en: undefined, sw \}/);
});

test('every feature file the languages import has a record the build can cut down', () => {
  const imported = new Set(LOCALES.flatMap((l) => featureImports(`${l}.ts`)));
  assert.ok(imported.size > 40, 'the language files import their feature copy');
  for (const name of imported) {
    const source = read(`${name}.ts`);
    for (const locale of LOCALES) {
      const { source: kept, found } = stripToLocale(source, locale);
      assert.ok(found > 0, `${name}.ts has no language record, so every page would carry all of it`);
      for (const entries of languageRecords(kept)) {
        for (const e of entries.filter((entry) => entry.locale !== locale)) assert.equal(e.value, 'undefined', `${name}.ts still carries ${e.locale} for ${locale}`);
      }
    }
  }
});
