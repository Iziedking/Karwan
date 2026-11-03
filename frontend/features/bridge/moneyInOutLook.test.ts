import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { moneyPageCopy } from '../../shared/i18n/messages/moneyPage';
import { plainMoneyCopy } from '../../shared/i18n/messages/plainMoney';

/// Add money and Withdraw in the new look (view 48, batch 9a, Figma page
/// "Batch 9 · Money in and out").
///
///   npx tsx --test features/bridge/moneyInOutLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = [
  '../../app/bridge/page.tsx',
  '../deposit/components/PlainChooser.tsx',
  '../deposit/components/DepositCard.tsx',
  './components/BridgeCard.tsx',
  './components/BridgeOutCard.tsx',
  './components/TransferProgress.tsx',
  './components/BridgeActivityStrip.tsx',
  './components/GatewayBalanceCard.tsx',
  './components/SolanaConnectCard.tsx',
  './components/BridgeHistorySection.tsx',
  './components/CrossChainFlow.tsx',
  '../money/components/WithdrawStart.tsx',
];

test('no green outside the one main button: no accent tints, no positive colour, no hand-made green buttons', () => {
  for (const file of FILES) {
    const s = source(file);
    assert.doesNotMatch(s, /--lp-accent/, file);
    assert.doesNotMatch(s, /rgba\(\s*175,\s*201,\s*91/, file);
    assert.doesNotMatch(s, /--color-positive/, file);
    assert.doesNotMatch(s, /bg-\[var\(--action\)\]|background: 'var\(--action\)'/, file);
  }
});

test('the old card style and the shouty mono labels are gone', () => {
  for (const file of FILES) {
    const s = source(file);
    assert.doesNotMatch(s, /const CARD_STYLE\b/, file);
    assert.doesNotMatch(s, /uppercase tracking-\[0\.\d+em\]/, file);
    assert.doesNotMatch(s, /font-extrabold/, file);
  }
});

test('the add choices are labels only, with no explainer line', () => {
  const s = source('../deposit/components/PlainChooser.tsx');
  assert.doesNotMatch(s, /\.note\b/);
  for (const locale of Object.values(plainMoneyCopy)) {
    for (const option of Object.values(locale.add)) assert.equal('note' in option, false);
  }
});

test('Withdraw carries the amount and address into the out card, and asks once more before money moves', () => {
  const page = source('../../app/bridge/page.tsx');
  assert.match(page, /<BridgeOutCard prefillAmount=\{prefillAmount\} prefillRecipient=\{prefillRecipient\} \/>/);
  const out = source('./components/BridgeOutCard.tsx');
  assert.match(out, /<FactsConfirmSheet/);
  assert.doesNotMatch(out, /t\.reassurance/);
});

test('the review words exist in every language, with no em dash', () => {
  for (const [locale, t] of Object.entries(moneyPageCopy)) {
    for (const key of ['review', 'reviewTitle', 'cannotUndo', 'toLabel', 'networkLabel', 'withdrawing', 'notNow', 'usdcOnly', 'moneyLabel'] as const) {
      assert.ok(t[key], `${locale}.${key}`);
      assert.doesNotMatch(t[key], /—/, `${locale}.${key}`);
    }
    assert.match(t.reviewTitle, /\{amount\}/, locale);
    assert.match(t.withdrawing, /\{amount\}/, locale);
  }
});

test('Withdraw lists a bank account and a card as coming soon, never as a pick', () => {
  const start = source('../money/components/WithdrawStart.tsx');
  assert.match(start, /soon\(t\.toBank\)/);
  assert.match(start, /soon\(t\.toCard\)/);
  assert.match(start, /aria-disabled/);
  for (const [locale, t] of Object.entries(moneyPageCopy)) {
    for (const key of ['toBank', 'toCard', 'comingSoon'] as const) {
      assert.ok(t[key], `${locale}.${key}`);
      assert.doesNotMatch(t[key], /—/, `${locale}.${key}`);
    }
  }
});
