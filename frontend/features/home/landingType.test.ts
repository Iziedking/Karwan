import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sheets = [
  './components/SocialTradeSection.module.css',
  './components/ProtectionSection.module.css',
  './components/TradeRoutesMap.module.css',
  '../../app/landing.module.css',
];

test('nothing on the landing page, mock-ups included, is under 14px', () => {
  for (const sheet of sheets) {
    const css = readFileSync(new URL(sheet, import.meta.url), 'utf8');
    for (const [, size] of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(size) >= 14, `${sheet} has ${size}px`);
    }
  }
});
