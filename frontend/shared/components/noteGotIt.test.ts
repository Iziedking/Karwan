import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { en } from '../i18n/messages/en';
import { fr } from '../i18n/messages/fr';
import { ar } from '../i18n/messages/ar';
import { hi } from '../i18n/messages/hi';
import { sw } from '../i18n/messages/sw';

const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

test('every note closes with Got it, and its focus does not reopen it (owner, 9 Nov 2026)', () => {
  const hint = source('./Hint.tsx');
  assert.match(hint, /data-hint-got-it/);
  assert.match(hint, /\{t\.gotIt\}/);
  assert.match(hint, /quietFocus/);
  assert.doesNotMatch(hint, /pointer-events-none normal-case/, 'the note takes taps so Got it can be pressed');
  for (const copy of [en, fr, ar, hi, sw]) assert.ok(copy.hint.gotIt.trim().length > 0);
});

test('the older info bubble opens the same note', () => {
  const lp = source('./LpHint.tsx');
  assert.match(lp, /<Hint side=\{side\} align=\{align\}>/);
  assert.doesNotMatch(lp, /role="tooltip"/);
});

test('the first-visit note uses the same bubble, closes with Got it and is remembered (owner, 9 Nov 2026)', async () => {
  const coach = source('./CoachNote.tsx');
  assert.match(coach, /bg-\[var\(--soft-green\)\]/);
  assert.match(coach, /data-coach-got-it/);
  assert.match(coach, /localStorage\.setItem\(key, '1'\)/);
  assert.match(coach, /if \(!show \|\| disabled \|\| hasActive\) return null;/, 'no note with the guide off or while a tour is open');
  assert.match(source('../../features/money/components/MoneyHome.tsx'), /<CoachNote id="money-balance">\{pages\.firstVisit\}<\/CoachNote>/);
  const { moneyPagesCopy } = await import('../i18n/messages/moneyPages');
  for (const copy of Object.values(moneyPagesCopy)) {
    assert.ok(copy.firstVisit.trim().length > 0);
    assert.doesNotMatch(copy.firstVisit, /—|USDC/);
  }
});

test('long notes on record, financier and order screens open from an (i) (owner, 9 Nov 2026)', () => {
  const read = (p: string) => source(p);
  assert.match(read('../../features/reputation/components/CreditPassport.tsx'), /<Hint side="bottom">\{t\.record\.meaning\}<\/Hint>/);
  assert.match(read('../../features/reputation/components/PublicPassport.tsx'), /<Hint side="bottom">\{sr\.noNumbers\}<\/Hint>/);
  assert.doesNotMatch(read('../../features/verification/RecordView.tsx'), /<p className="mt-6[^"]*">\{t\.meaning\}<\/p>/);
  assert.match(read('../../features/financier/components/FinancierApply.tsx'), /<Hint side="bottom">\{copy\.intro\}<\/Hint>/);
  assert.match(read('../../features/order/OrderPage.tsx'), /<Hint>\{deliverBy \? fill\(t\.protectedBody/);
});
