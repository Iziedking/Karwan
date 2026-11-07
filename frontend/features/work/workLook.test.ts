import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/// The work pages in the new look (view 48, batch 9i, Figma page "Batch 9 ·
/// Work pages").
///
///   npx tsx --test features/work/workLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const FILES = {
  page: source('./components/WorkPage.tsx'),
  form: source('./components/WorkForm.tsx'),
  request: source('./components/WorkRequestPage.tsx'),
  requestForm: source('./components/WorkRequestForm.tsx'),
  open: source('./components/OpenWorkRequests.tsx'),
  seller: source('./components/SellerBlock.tsx'),
};

test('no old landing tokens or old shared controls, nothing bold or small', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-|var\(--accent\)|--accent-ink|--tint\b/, name);
    assert.doesNotMatch(s, /\b(PRIMARY|QUIET|FIELD)\b/, name);
    assert.doesNotMatch(s, /font-(extra)?bold|text-\[(9|1[0-3])(\.\d+)?px\]|\bmono\b|uppercase/, name);
    assert.doesNotMatch(s, /text-\[28px\]/, name);
  }
});

test('each week and the offers sit in cards; the one main step is the green button', () => {
  const { page, request } = FILES;
  assert.match(page, /<li key=\{w\.k\} className=\{`\$\{CARD_CLASS\}/);
  assert.match(page, /primaryWeek === w\.k \? GREEN : QUIET_BUTTON/);
  assert.match(request, /CARD_CLASS/);
  assert.match(request, /o\.recommended \? GREEN : QUIET_BUTTON/);
});

test('By the hour or Monthly is one segmented track, marked in ink', () => {
  for (const file of [FILES.form, FILES.requestForm]) {
    assert.match(file, /role="radiogroup" className="grid grid-cols-2 gap-1 rounded-\[12px\] bg-\[var\(--ash\)\] p-1"/);
    assert.match(file, /shadow-\[inset_0_0_0_1px_var\(--ink\)\]/);
  }
});

test('a person is named by tag, and every figure reads in the account currency (owner, 7 Nov 2026)', () => {
  const { form, page, request, open } = FILES;
  // A link with a wallet becomes the tag, or says they have none; it never sits as a tag that is not found.
  assert.match(form, /usePersonTag\(who\)/);
  assert.match(form, /t\.form\.whoNoTag/);
  assert.match(form, /hourly \? t\.form\.title : t\.form\.titleMonthly/);
  const deal = source('../deals/components/DirectDealForm.tsx');
  assert.match(deal, /usePersonTag\(initialSeller\)/);
  assert.doesNotMatch(deal, /withWho=\{initialSeller \?/);
  // Amounts go through the money text, never a bare "{amount} USDC".
  for (const [name, s] of Object.entries({ form, page, request, open })) {
    assert.doesNotMatch(s, /[^.]\bfill\([^()]*\{ amount: /, name);
  }
  const copy = source('../../shared/i18n/messages/work.ts');
  assert.doesNotMatch(copy, /[,،] USDC['"]/);
  // Hourly work is paid a week at a time, so the choice says so.
  assert.match(copy, /hourly: 'Hourly, paid weekly'/);
  // The global .form-input padding outranks a utility class, so the sign's room is set inline.
  assert.match(source('../money/components/MoneyInput.tsx'), /style=\{before \? \{ paddingInlineStart:/);
});
