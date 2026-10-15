import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const form = readFileSync(new URL('./components/PostListingForm.tsx', import.meta.url), 'utf8');
const list = form.slice(form.indexOf('pl.yourOffers.eyebrow'));

test('Your offers reads like the Request list', () => {
  assert.doesNotMatch(list, /text-\[13px\]|uppercase|\bmono\b/, 'no small mono capitals');
  assert.doesNotMatch(list, /title=\{pl\.dismissTitle\}/, 'no browser tooltip on dismiss');
  assert.doesNotMatch(list, /role="link"/, 'each row is a real link');
  assert.match(list, /<Link\s/);
  assert.match(list, /walletAmount\(/, 'amounts to the cent');
  assert.match(list, /rounded-full px-2\.5 py-0\.5 text-\[14px\] font-semibold/, 'status is a tinted label');
  assert.match(list, /<Icon name="chevron-right"[^>]*directional/);
  assert.match(list, /<Icon name="close"/);
});
