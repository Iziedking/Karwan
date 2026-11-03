import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// Payment requests in the new look (view 48, batch 9d, Figma page
/// "Batch 9 · Payment request").
///
///   npx tsx --test features/payLink/payLinkLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  create: source('./CreatePayLink.tsx'),
  share: source('./ShareLink.tsx'),
  pay: source('./PayRequestView.tsx'),
  anyChain: source('./AnyChainPay.tsx'),
  picker: source('./SourcePicker.tsx'),
  fund: source('./FundToPay.tsx'),
  history: source('./PayLinkHistory.tsx'),
};

test('the old landing tokens are gone, and nothing is bold or under 14px', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-/, name);
    assert.doesNotMatch(s, /#10170b/i, name);
    assert.doesNotMatch(s, /--tint\b/, name);
    assert.doesNotMatch(s, /font-(extra)?bold/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
  }
});

test('green is a signal only on a Paid label, never on a step or a picked option', () => {
  for (const [name, s] of Object.entries(FILES)) {
    if (name === 'history') continue;
    assert.doesNotMatch(s, /--color-positive/, name);
  }
});

test('every main button is the shared one, and a picked way to pay is ink', () => {
  for (const name of ['create', 'share', 'pay', 'anyChain'] as const) {
    assert.match(FILES[name], /buttonClasses\(|<Button\b/, name);
  }
  const { share, pay, picker } = FILES;
  const copyAt = share.indexOf('copy.copy');
  const shareAt = share.indexOf('copy.share');
  assert.ok(copyAt > 0 && shareAt > copyAt, 'Copy link comes before Share');
  assert.match(share, /variant: 'secondary'/);
  assert.match(pay, /aria-checked=\{!!selected\}/);
  assert.match(pay, /bg-\[var\(--ink\)\]/, 'the picked way to pay fills its radio with ink');
  assert.match(picker, /bg-\[var\(--ink\)\]/);
});

test('a link, a receipt card and the steps sit in the one card', () => {
  for (const name of ['share', 'pay', 'anyChain', 'fund', 'history'] as const) {
    assert.match(FILES[name], /CARD_CLASS/, name);
  }
});
