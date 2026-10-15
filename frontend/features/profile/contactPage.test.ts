import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const email = read('./components/ProfileEmailButton.tsx');
const telegram = read('../telegram/components/TelegramConnectButton.tsx');
const x = read('./components/ConnectXButton.tsx');
const page = read('../../app/profile/page.tsx');

test('email and Telegram open in the shared sheet, not a hand-built pop-up', () => {
  for (const [name, src] of [['email', email], ['telegram', telegram]] as const) {
    assert.match(src, /<ConfirmSheetShell open labelledBy=/, name);
    assert.doesNotMatch(src, /createPortal/, name);
  }
});

test('contact controls are full-size, readable, and never lean on a browser tooltip', () => {
  for (const [name, src] of [['email', email], ['telegram', telegram], ['x', x]] as const) {
    assert.doesNotMatch(src, / title=\{/, name);
    assert.doesNotMatch(src, /text-\[13px\]/, name);
    assert.doesNotMatch(src, /\bmono\b/, name);
    assert.match(src, /min-h-11/, name);
  }
  // The whole address shows; it wraps rather than being cut.
  assert.doesNotMatch(email, /max-w-\[240px\]/);
});

test('Telegram and X say what connecting does', () => {
  assert.match(page, /hub\.telegramNote/);
  assert.match(page, /hub\.xNote/);
});
