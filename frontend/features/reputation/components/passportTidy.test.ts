import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getShellSurface } from '../../../shared/utils/routes';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('a signed-in person keeps the app around a passport; a visitor sees the public page', () => {
  assert.equal(getShellSurface('/credit-passport/0x123', true), 'workspace');
  assert.equal(getShellSurface('/credit-passport/0x123', false), 'public');
});

test('the owner view retains back navigation, grouped amounts and a drawn chevron', () => {
  const passport = read('./CreditPassport.tsx');
  assert.match(passport, /data-own-back/);
  assert.doesNotMatch(passport, /⌄/);
  // Amounts read in the chosen currency with grouped USDC under them (owner, 5 Nov 2026).
  assert.match(passport, /<Price usdc=\{Number\(volume\)\}/);
  // Responsive label fit is verified in the production browser suite.
  assert.doesNotMatch(read('../../../shared/components/BackButton.tsx'), /h-9 px-2\.5/);
});

test('the sealed view names the tier in a tinted label, not a dot', () => {
  const sealed = read('./PublicPassport.tsx');
  assert.doesNotMatch(sealed, /size-2 rounded-full/);
  assert.match(sealed, /tierBg\(sealed\.tier\)/);
});
