import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// Activity and receipts in the new look (view 48, batch 9c, Figma page
/// "Batch 9 · Activity and receipts").
///
///   npx tsx --test features/activity/activityLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  view: source('./components/ActivityView.tsx'),
  ledger: source('./components/MyMoneyLedger.tsx'),
  filters: source('./components/ActivityFilters.tsx'),
  receipt: source('./components/PortableReceipt.tsx'),
  settlement: source('../deals/components/SettlementRecord.tsx'),
};

test('no green outside the one main button, and nothing under 14px or in mono capitals', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-accent/, name);
    assert.doesNotMatch(s, /--color-positive/, name);
    assert.doesNotMatch(s, /rgba\(\s*175\s*,\s*201\s*,\s*91/, name);
    assert.doesNotMatch(s, /uppercase tracking-\[/, name);
    assert.doesNotMatch(s, /font-(extra)?bold/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
  }
});

test('an amount is signed, never coloured, and each day is one card of rows', () => {
  const { ledger } = FILES;
  assert.doesNotMatch(ledger, /color: direction === 'in'/, 'money in is not a different colour');
  assert.match(ledger, /data-ledger-amount/);
  assert.match(ledger, /CARD_CLASS/);
});

test('the receipt has one main button, Download image, and no hard-coded words', () => {
  const { receipt } = FILES;
  assert.doesNotMatch(receipt, />Receipt</);
  const image = receipt.indexOf('copy.receiptExportImage');
  const pdf = receipt.indexOf('copy.receiptExportPdf');
  assert.ok(image > 0 && pdf > image, 'Download image comes first');
  assert.match(receipt, /buttonClasses\(\{ size: 'lg'/);
  assert.match(receipt, /buttonClasses\(\{ variant: 'secondary', size: 'lg'/);
});
