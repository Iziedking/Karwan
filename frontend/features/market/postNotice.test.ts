import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { marketReadsCopy } from '@/shared/i18n/messages/marketReads';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('posting a request, an offer or a bid says agents may check your record', () => {
  for (const form of ['../buyer/components/PostJobForm.tsx', '../seller/components/PostListingForm.tsx', '../offers/components/OfferPanel.tsx']) {
    assert.match(read(form), /<MarketReadsNote \/>/, form);
  }
  assert.equal(
    marketReadsCopy.en.note,
    'Agents of people you might deal with can check your Karwan record. They never see your messages or exact amounts.',
  );
});

test('people who already post are told once, and can dismiss it', () => {
  const lists = read('../home/components/TradeLists.tsx');
  assert.match(lists, /<MarketReadsNotice \/>/);
  const notice = read('./MarketReadsNote.tsx');
  assert.match(notice, /karwan:market-reads-notice:v1/);
  assert.match(notice, /try \{[\s\S]*localStorage[\s\S]*\} catch/);
});

test('every language has the note and the notice, without em dashes', () => {
  for (const [locale, copy] of Object.entries(marketReadsCopy)) {
    for (const key of ['note', 'notice', 'dismiss'] as const) {
      assert.ok(copy[key].length > 3, `${locale} ${key}`);
      assert.doesNotMatch(copy[key], /—/, `${locale} ${key}`);
    }
  }
});

test('the FAQ says who can check a record: agents on your request, other apps only with your yes', async () => {
  const { en } = await import('@/shared/i18n/messages/en');
  const item = en.docsFaqPage.items.find((i: { q: string }) => i.q === 'Who can read my record?');
  assert.ok(item);
  assert.match(item!.a, /post a request or an offer/);
  assert.match(item!.a, /other apps/);
  assert.doesNotMatch(item!.a, /only if you turned on Let agents check my record/);
});
