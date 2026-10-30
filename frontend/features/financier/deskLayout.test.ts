import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const desk = readFileSync(new URL('./components/FinancierDashboard.tsx', import.meta.url), 'utf8');
const positions = readFileSync(new URL('./components/FactoringPositionsPanel.tsx', import.meta.url), 'utf8');

test('the finance page follows the current interface rules', () => {
  for (const [name, src] of [['desk', desk], ['positions', positions]] as const) {
    assert.equal(/<select\b/.test(src), false, `${name}: no native select`);
    assert.equal(/HeroHeadline|SectionTag|<Punc/.test(src), false, `${name}: no old hero grammar`);
    assert.equal(/<[a-z][\w-]*\s[^>]*\btitle=/.test(src), false, `${name}: no browser tooltips`);
    assert.equal(/shortAddress|text-\[13px\]|mono /.test(src), false, `${name}: no raw addresses, 13px text or mono labels`);
  }
});

test('the page sits inside the app shell main and adds no second main landmark', () => {
  assert.equal(/<main\b/.test(desk), false);
});

test('money steps open in the shared confirm sheet', () => {
  assert.equal((desk.match(/<ConfirmSheetShell /g) ?? []).length, 2);
  assert.equal(/role="dialog"/.test(desk), false);
});

test('your positions come before the invoices to finance, and finished ones after', () => {
  assert.ok(desk.indexOf('<FactoringPositionsPanel') < desk.indexOf('<InvoiceList'));
  assert.ok(desk.indexOf('<InvoiceList') < desk.indexOf('<FactoringHistoryPanel'));
});

test('purchase-order financing stays hidden behind its flag', () => {
  assert.match(desk, /PO_FINANCING_ENABLED && <POLinesPanel/);
  assert.match(desk, /\{PO_FINANCING_ENABLED && \(\s*<section aria-labelledby="open-orders"/);
});
