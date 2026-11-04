import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { financeDeskCopy } from '@/shared/i18n/messages/financeDesk';

/// The finance desk, business home and business verification in the new look
/// (view 48, batch 9h, Figma page "Batch 9 · Business and financier").
///
///   npx tsx --test features/financier/financierLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  dashboard: source('./components/FinancierDashboard.tsx'),
  positions: source('./components/FactoringPositionsPanel.tsx'),
  apply: source('./components/FinancierApply.tsx'),
  position: source('./components/FinancingPositionWorkspace.tsx'),
  poLines: source('./components/POLinesPanel.tsx'),
  poLine: source('./components/PoLinePage.tsx'),
  paySeller: source('./components/PaySeller.tsx'),
  gate: source('./components/FinancierGate.tsx'),
  soon: source('./components/SmeTradesComingSoon.tsx'),
  businessHome: source('../home/components/BusinessHome.tsx'),
  register: source('../profile/components/RegisterBusinessBand.tsx'),
  company: source('../profile/components/SmeCompanyBand.tsx'),
};

test('no old landing tokens, nothing bold, small or in mono capitals', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-|--color-accent|var\(--accent\)|--accent-ink|--tint\b/, name);
    assert.doesNotMatch(s, /font-(extra)?bold/, name);
    assert.doesNotMatch(s, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
    assert.doesNotMatch(s, /uppercase tracking-\[|\bmono\b/, name);
    assert.doesNotMatch(s, /bg-black\/|rgba\(175/, name);
  }
});

test('positions sit in cards, an active one is marked in ink, and amounts carry no colour', () => {
  const { positions } = FILES;
  assert.match(positions, /accepted: 'bg-\[var\(--ink\)\]'/);
  assert.match(positions, /CARD_CLASS/);
  assert.doesNotMatch(positions, /border-y/);
});

test('Apply reads from the five languages, checks are ink, and Apply is the one green button', () => {
  const { apply } = FILES;
  assert.match(apply, /financeDeskCopy\[locale\]\.apply/);
  assert.doesNotMatch(apply, /'Time on Karwan'|Fund trade, earn the spread/);
  assert.match(apply, /buttonClasses\(\{ size: 'lg'/);
  assert.match(apply, /CARD_CLASS/);
  assert.doesNotMatch(apply, /--action/);
});

test('PO lines read from the five languages and their states are words, never colours', () => {
  const { poLines } = FILES;
  assert.match(poLines, /financeDeskCopy\[locale\]\.poLines/);
  assert.doesNotMatch(poLines, /STATE_TONE|#[0-9a-f]{6}|'Dismiss'|My PO lines|RETIRED RAIL/);
  assert.match(poLines, /CARD_CLASS/);
});

test('business home leaves green to Find supply, with no blinking light', () => {
  const { businessHome } = FILES;
  assert.doesNotMatch(businessHome, /rounded-full bg-\[var\(--action\)\] px-/);
  assert.match(businessHome, /buttonClasses\(\{ variant: 'secondary'/);
  assert.doesNotMatch(businessHome, /instrumentBlink/);
  assert.match(businessHome, /stroke="var\(--ink\)"/);
});

test('business verification keeps Submit green and its checkbox in ink', () => {
  const { register, company } = FILES;
  assert.equal(register.match(/rounded-full bg-\[var\(--action\)\] px-/g)?.length, 1);
  assert.match(company, /accent-\[var\(--ink\)\]/);
});

test('every language has every finance desk key, without em dashes', () => {
  const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
  const en = keys(financeDeskCopy.en);
  for (const locale of ['fr', 'ar', 'hi', 'sw'] as const) {
    assert.deepEqual(keys(financeDeskCopy[locale]), en, locale);
    assert.doesNotMatch(JSON.stringify(financeDeskCopy[locale]), /—/);
  }
});

test('the finance desk says less: its intro is a nudge and an empty list is one line (owner, 4 Nov)', () => {
  const { dashboard, positions } = FILES;
  assert.match(dashboard, /<Nudge id="finance-desk"/);
  assert.doesNotMatch(dashboard, /<p[^>]*>\{t\.intro\}<\/p>/);
  assert.match(dashboard, /<Hint>\{body\}<\/Hint>/);
  assert.match(positions, /summary\.active > 0 \|\| needsYou\.length > 0/);
});
