import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearRequestDraft, loadRequestDraft, REQUEST_DRAFT_KEY, saveRequestDraft } from '@/features/buyer/requestDraft';
import { moneyCopy } from '@/shared/i18n/messages/money';
import { nudgeCopy } from '@/shared/i18n/messages/nudge';
import { requestFlowCopy } from '@/shared/i18n/messages/requestFlow';

/// Owner notes, 4 Nov 2026, before batch 9i.
///
///   npx tsx --test shared/components/ownerNotes4Nov.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('on a phone the tab you are on sits on a Karwan green pill', () => {
  const nav = source('./WorkspaceBottomNav.tsx');
  assert.match(nav, /item\.active && 'bg-\[var\(--action\)\] text-\[var\(--on-action\)\]'/);
});

test('Add money is the green circle on Home, and the faucet drop has a touch of green', () => {
  const home = source('../../features/home/components/AccountHome.tsx');
  assert.equal(home.match(/ green>/g)?.length, 1);
  assert.match(home, /icon="add" green>/);
  assert.match(source('../../features/home/components/FaucetDrop.tsx'), /fill="var\(--action\)"/);
});

test('Transfer balance says what it is behind an info tip, in every language', () => {
  assert.match(source('../../features/money/components/WhereItIsSheet.tsx'), /<Hint>\{t\.money\.home\.gatewayBalanceHint\}<\/Hint>/);
  for (const [locale, copy] of Object.entries(moneyCopy)) {
    assert.ok(copy.home.gatewayBalanceHint.length > 20, locale);
    assert.ok(copy.sheet.useOther.includes('{name}'), locale);
    assert.doesNotMatch(copy.home.gatewayBalanceHint + copy.sheet.useOther, /—/, locale);
  }
});

test('hours and minutes sit beside Pick a date, with no link to open them', () => {
  const due = source('../../features/deals/components/DueChips.tsx');
  assert.match(due, /data-due-time/);
  assert.doesNotMatch(due, /underline underline-offset-4/);
  assert.ok(due.indexOf('data-due-time') > due.indexOf('type="date"'));
});

test('a short top-up offers the other agent and opens Add USDC in a new tab', () => {
  const sheet = source('../../features/money/components/MoneySheet.tsx');
  assert.match(sheet, /setFromOtherAgent\(true\)/);
  assert.match(sheet, /href="\/bridge\?intent=add" target="_blank" rel="noopener"/);
  assert.match(sheet, /move: 'withdraw',\s*agent: agent === 'buyer' \? 'seller' : 'buyer'/);
});

test('a profile opens in a new tab, so the page you were on stays', () => {
  for (const file of ['../../features/jobs/components/Shortlist.tsx', '../../features/deals/workspace/DealHero.tsx', '../../features/work/components/SellerBlock.tsx']) {
    assert.match(source(file), /target="_blank" rel="noopener"/, file);
  }
});

test('the request page loads, and says it cannot be shown, in the new look', () => {
  const page = source('../../features/jobs/components/JobPageClient.tsx');
  assert.doesNotMatch(page, /HeroHeadline|SectionTag|GridOverlay|Punc|--lp-|\bmono\b/);
  assert.match(page, /aria-busy="true"/);
});

test('a deal link names its person above the kinds, and the nudge closes in every language', () => {
  assert.match(source('../../features/deals/components/KindPicker.tsx'), /data-kind-with/);
  for (const [locale, copy] of Object.entries(requestFlowCopy)) assert.match(copy.kindWith, /\{who\}/, locale);
  for (const [locale, copy] of Object.entries(nudgeCopy)) assert.ok(copy.close.length > 1, locale);
});

test('a request half written is kept for the visit and cleared once it posts', () => {
  const data = new Map<string, string>();
  const mem = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  saveRequestDraft({ brief: 'A logo for my shop', budget: 35, deadlineValue: 7, deadlineUnit: 'd', tolerance: '' }, mem);
  assert.deepEqual(loadRequestDraft(mem), { brief: 'A logo for my shop', budget: 35, deadlineValue: 7, deadlineUnit: 'd', tolerance: '' });
  saveRequestDraft({ brief: ' ', budget: '', deadlineValue: '', deadlineUnit: 'd', tolerance: '' }, mem);
  assert.equal(data.has(REQUEST_DRAFT_KEY), false);
  data.set(REQUEST_DRAFT_KEY, '{"brief":1}');
  assert.equal(loadRequestDraft(mem), null);
  clearRequestDraft(mem);
  assert.equal(data.has(REQUEST_DRAFT_KEY), false);
  const form = source('../../features/buyer/components/PostJobForm.tsx');
  assert.ok(form.indexOf('clearRequestDraft();') < form.indexOf('router.push(`/jobs/${r.jobId}`)'));
});
