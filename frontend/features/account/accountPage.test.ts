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

test('actions use the icon set, not typed characters', () => {
  assert.doesNotMatch(page, />\+<\/span>|>↔<\/span>|>↑<\/span>|>→<\/span>/);
  assert.match(page, /<Icon name="plus"/);
  assert.match(page, /<Icon name="arrow-up-right"/);
  assert.match(page, /<Icon name="send"/);
  assert.match(page, /<Icon name="chevron-right"[^>]*directional/);
});
