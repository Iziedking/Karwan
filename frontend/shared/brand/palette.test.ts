import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { brandPalette } from './palette';
import { en } from '../i18n/messages/en';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('published palette lists the interface colors actually defined in the product', () => {
  const css = read('../../app/globals.css');
  const roles: Record<string, string> = {
    brandLime: '--karwan-green',
    brandInk: '--ink-inv-0',
    creamSurface: '--karwan-canvas',
    cardWhite: '--karwan-card',
    darkRaised: '--surface-1',
    darkInset: '--surface-2',
    lightInset: '--paper-2',
    lightSecondary: '--ink-inv-2',
    darkSecondary: '--ink-2',
    greenOnLight: '--lp-accent-on-light',
  };
  assert.equal(brandPalette.length, Object.keys(roles).length);
  for (const color of brandPalette) {
    assert.ok(en.brandPage.palette[color.key]);
    assert.match(css, new RegExp(`${roles[color.key]}:\\s*${color.hex}`, 'i'), color.key);
  }
});

test('press assets and page use the same mark and omit stale wordmark PNG downloads', () => {
  const page = read('../../app/brand/page.tsx');
  const light = read('../../public/brand/karwan-wordmark-light.svg');
  const dark = read('../../public/brand/karwan-wordmark-dark.svg');
  const mark = read('../../public/karwan-app-icon.svg');
  for (const asset of [light, dark]) {
    assert.match(asset, /Karwan<\/text>/);
    assert.match(asset, /52-166 32 100 32-100 52 166/);
  }
  assert.match(mark, /M116,283 L168,117/);
  assert.doesNotMatch(page, /karwan-wordmark-(?:light|dark)\.png/);
  assert.doesNotMatch(page, /text-\[var\(--lp-card\)\]/, 'fixed dark sections must not inherit the theme-switched card color');
  assert.equal((page.match(/text-\[#F4F4F1\]/g) ?? []).length, 2, 'hero and contact headings use the fixed light brand ink');
});
