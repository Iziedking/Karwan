import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Send draws Back on its own column, above the flow', () => {
  const send = readFileSync(new URL('./components/SendFlow.tsx', import.meta.url), 'utf8');
  assert.match(send, /max-w-\[480px\][\s\S]*data-own-back[\s\S]*<ProductBackLink/);
});

test('the deal page draws Back on its own column, right above the deal', () => {
  const workspace = readFileSync(new URL('../deals/workspace/DealWorkspace.tsx', import.meta.url), 'utf8');
  const page = workspace.slice(workspace.indexOf('<div className="product-surface'));
  assert.match(page, /^<div className="product-surface mx-auto max-w-\[640px\][^"]*">\s*<div data-own-back[^>]*>\s*<ProductBackLink/);
});
