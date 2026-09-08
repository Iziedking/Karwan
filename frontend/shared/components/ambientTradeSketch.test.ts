import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const chromeSource = readFileSync(
  fileURLToPath(new URL('./ChromeFrame.tsx', import.meta.url)),
  'utf8',
);
const cssSource = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8',
);

test('every customer route shell mounts the shared ambient trade drawing', () => {
  const mounts = chromeSource.match(/<AmbientTradeSketch \/>/g) ?? [];

  assert.equal(mounts.length, 2, 'bare and customer shells should each mount the shared art');
  assert.match(chromeSource, /aria-hidden="true" className="global-trade-sketch"/);
  assert.doesNotMatch(chromeSource, /const productArt =/);
});

test('the ambient drawing is theme-aware, inert, and omitted from print', () => {
  assert.match(cssSource, /\.global-trade-sketch\s*\{[\s\S]*?pointer-events:\s*none;/);
  assert.match(cssSource, /background-image:\s*url\('\/media\/karwan-trade-sketch-clean\.png'\)/);
  assert.match(cssSource, /html\[data-theme="dark"\] \.global-trade-sketch\s*\{/);
  assert.match(cssSource, /@media print\s*\{[\s\S]*?\.global-trade-sketch\s*\{[\s\S]*?display:\s*none !important;/);
});
