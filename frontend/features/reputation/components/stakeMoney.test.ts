import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('guarantee and yield money ask first, on their own page or in the confirm sheet, never a browser popup', () => {
  for (const file of ['../../guarantee/GuaranteeTab.tsx', '../../guarantee/GuaranteeMove.tsx']) assert.doesNotMatch(read(file), /window\.confirm/, file);
  // Each guarantee move is its own page with one button that says what moves (view 51, fifth round).
  assert.match(read('../../guarantee/GuaranteeMove.tsx'), /<MoneyFrame page labelledBy=\{titleId\}/);
  const claim = read('./YieldClaimPanel.tsx');
  assert.match(claim, /<ConfirmSheetShell[^>]*open=\{sheetOpen\}/);
});
