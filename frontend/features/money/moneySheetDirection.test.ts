import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sheet = readFileSync(new URL('./components/MoneySheet.tsx', import.meta.url), 'utf8');

test('a top-up sheet never turns into a withdrawal, and the other way round', () => {
  assert.doesNotMatch(sheet, /setMove\(/, 'the move is fixed by the button that opened the sheet');
  assert.doesNotMatch(sheet, /⇄/, 'no swap control between From and To');
  assert.doesNotMatch(sheet, /t\.sheet\.swap/);
});
