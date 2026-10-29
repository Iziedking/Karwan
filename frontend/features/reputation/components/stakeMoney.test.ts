import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('guarantee and yield money ask first, in the confirm sheet, never a browser popup', () => {
  const card = read('../../guarantee/GuaranteeCard.tsx');
  assert.doesNotMatch(card, /window\.confirm/);
  assert.match(card, /<ConfirmSheetShell[^>]*open=\{step !== null\}/);
  const claim = read('./YieldClaimPanel.tsx');
  assert.match(claim, /<ConfirmSheetShell[^>]*open=\{sheetOpen\}/);
});
