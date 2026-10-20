import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./AccountPageV1.tsx', import.meta.url), 'utf8');

test('the money is louder than the page title', () => {
  const h1 = page.match(/<h1 className="([^"]*)"/)?.[1] ?? '';
  assert.doesNotMatch(h1, /clamp\(/);
  const size = Number(h1.match(/text-\[(\d+)px\]/)?.[1]);
  assert.ok(size < 40, 'the 40px total stays the largest type');
});

test('actions are button tiles from the icon set, never typed characters or chevrons (owner, 20 Oct 2026)', () => {
  const panel = readFileSync(new URL('./WalletPanel.tsx', import.meta.url), 'utf8');
  for (const src of [page, panel]) {
    assert.doesNotMatch(src, />\+<\/span>|>↔<\/span>|>↑<\/span>|>→<\/span>/);
    assert.doesNotMatch(src, /chevron-right/);
  }
  assert.match(panel, /plus: 'plus'/);
  assert.match(panel, /out: 'arrow-up-right'/);
  assert.match(panel, /send: 'send'/);
  assert.match(panel, /<Icon name=\{ICON\[action\.icon\]\}/);
  assert.match(page, /<WalletPanel tab=\{view\} \/>/);
});
