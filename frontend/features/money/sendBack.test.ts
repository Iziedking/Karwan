import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Send draws Back on its own column, beside the form', () => {
  const sheet = readFileSync(new URL('./components/MoneySheet.tsx', import.meta.url), 'utf8');
  const frame = sheet.slice(sheet.indexOf('function Frame('));
  assert.match(frame, /max-w-\[560px\][\s\S]*data-own-back[\s\S]*<ProductBackLink/);
});

test('the deal page draws Back on its own column, right above the deal', () => {
  const workspace = readFileSync(new URL('../deals/workspace/DealWorkspace.tsx', import.meta.url), 'utf8');
  const page = workspace.slice(workspace.indexOf('<div className="product-surface'));
  assert.match(page, /^<div className="product-surface mx-auto max-w-\[560px\][^"]*">\s*<div data-own-back[^>]*>\s*<ProductBackLink/);
});
