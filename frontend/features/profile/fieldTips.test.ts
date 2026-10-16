import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reputationSourcesCopy } from '../../shared/i18n/messages/reputationSources';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TIP_KEYS = ['offer', 'description', 'sellerPrice', 'sellerDays', 'buyerMax', 'buyerDays', 'split'];

test('every agent limit on the edit form says what it does', () => {
  const form = read('../../app/profile/edit/page.tsx');
  for (const key of TIP_KEYS) assert.match(form, new RegExp(`tips\\.${key}\\b`), key);
  assert.doesNotMatch(form, /<[a-z]+\b[^>]*\stitle=/, 'no browser tooltip');
});

test('the agent summary on Profile carries the same tips', () => {
  const page = read('../../app/profile/page.tsx');
  for (const key of TIP_KEYS.filter((k) => k !== 'description' && k !== 'offer')) {
    assert.match(page, new RegExp(`tips\\.${key}\\b`), key);
  }
});

test('the tips exist in every language', () => {
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw']) {
    const src = read(`../../shared/i18n/messages/${locale}.ts`);
    const start = src.search(/profileEdit: \{\s*displayName: ['"]/);
    const block = src.slice(start, start + 6000);
    const tips = block.slice(block.indexOf('tips: {'));
    for (const key of TIP_KEYS) assert.match(tips.slice(0, 3000), new RegExp(`\\b${key}: ['"]`), `${locale} ${key}`);
  }
});

test('each Reputation section explains itself, in every language', () => {
  const view = read('./ui/ReputationSources.tsx');
  for (const key of ['titleTip', 'sourcesTip', 'balanceTip', 'readersTip']) {
    assert.match(view, new RegExp(`copy\\.${key}\\b`), key);
    for (const [locale, copy] of Object.entries(reputationSourcesCopy)) {
      const text = copy[key as 'titleTip'];
      assert.ok(text && text.length > 10, `${locale} ${key}`);
      assert.doesNotMatch(text, /—/, `${locale} ${key}: no em dash`);
    }
  }
});
