import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { en } from '../i18n/messages/en';
import { fr } from '../i18n/messages/fr';
import { ar } from '../i18n/messages/ar';
import { hi } from '../i18n/messages/hi';
import { sw } from '../i18n/messages/sw';

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('every note closes with Got it, and its focus does not reopen it (owner, 9 Nov 2026)', () => {
  const hint = source('./Hint.tsx');
  assert.match(hint, /data-hint-got-it/);
  assert.match(hint, /\{t\.gotIt\}/);
  assert.match(hint, /quietFocus/);
  assert.doesNotMatch(hint, /pointer-events-none normal-case/, 'the note takes taps so Got it can be pressed');
  for (const copy of [en, fr, ar, hi, sw]) assert.ok(copy.hint.gotIt.trim().length > 0);
});

test('the older info bubble opens the same note', () => {
  const lp = source('./LpHint.tsx');
  assert.match(lp, /<Hint side=\{side\} align=\{align\}>/);
  assert.doesNotMatch(lp, /role="tooltip"/);
});
