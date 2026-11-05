import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// View 54: the country sits under the tag and goes with the new account, and
/// the guide is a pop-up that never explains itself.
///
///   npx tsx --test features/signup/signupGuide.test.ts

const card = readFileSync(new URL('./components/AuthCard.tsx', import.meta.url), 'utf8');
const parts = readFileSync(new URL('../setup/StartParts.tsx', import.meta.url), 'utf8');
const setup = readFileSync(new URL('../setup/SetupFlow.tsx', import.meta.url), 'utf8');

test('the country is picked under the tag and sent with the new account', () => {
  assert.ok(card.indexOf('{tagLine}') < card.indexOf('<CountrySelect'), 'under the tag line');
  assert.match(card, /api\.signupCreate\(normalizeTag\(tag\), kind, country \?\? undefined\)/);
  assert.match(card, /browserCountry\(/);
});

test('the guide answers what the person just did', () => {
  assert.match(card, /f\.guide\.tagFree/);
  assert.match(card, /f\.guide\.tagTaken/);
  assert.match(card, /f\.guide\.country/);
  assert.match(card, /f\.guide\.codeLate/);
  assert.match(card, /f\.guide\.wallet/);
});

test('the guide pops up, fades after a reading time and carries no explanation of itself', () => {
  assert.match(parts, /createPortal\(/);
  assert.match(parts, /readingMs\(words\)/);
  assert.match(parts, /onPointerEnter=\{\(\) => setHeld\(true\)\}/);
  assert.doesNotMatch(parts.slice(parts.indexOf('function GuidePop')), /progress|countdown|seconds left/i);
  // The agent's read-back stays in the page.
  assert.match(setup, /<Nudge from="agent" live inline>/);
});
