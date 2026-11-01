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

test('the ways editor still says what the ways do (view 26)', () => {
  const editor = read('./WaysEditor.tsx');
  assert.match(editor, /hint=\{c\.hint\}/);
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
  for (const key of ['titleTip', 'sourcesTip', 'readersTip']) {
    assert.match(view, new RegExp(`copy\\.${key}\\b`), key);
    for (const [locale, copy] of Object.entries(reputationSourcesCopy)) {
      const text = copy[key as 'titleTip'];
      assert.ok(text && text.length > 10, `${locale} ${key}`);
      assert.doesNotMatch(text, /—/, `${locale} ${key}: no em dash`);
    }
  }
});

test('the record switch is about agents outside Karwan, and there is no second balance to fund', () => {
  const view = read('./ui/ReputationSources.tsx');
  assert.match(view, /checked=\{data\.sources\.outsideReadable\}/);
  assert.match(view, /update\(\{ outsideReadable: next \}\)/);
  assert.doesNotMatch(view, /copy\.balance|readsBalanceUsdc/);
  assert.equal(reputationSourcesCopy.en.readable, 'Let agents outside Karwan check my record');
  for (const [locale, copy] of Object.entries(reputationSourcesCopy)) {
    assert.ok(!('balance' in copy), `${locale} still has a balance row`);
  }
});

test('the agent page is called Your agent, in the page and the tab title (view 45)', async () => {
  const { routeTitlesCopy: routeTitles } = await import('../../shared/i18n/messages/routeTitles');
  const names = { en: 'Your agent', fr: 'Votre agent', ar: 'وكيلك', hi: 'आपका एजेंट', sw: 'Wakala wako' };
  for (const [locale, name] of Object.entries(names)) {
    const src = read(`../../shared/i18n/messages/${locale}.ts`);
    assert.match(src, new RegExp(`agentsTitle: "${name}"`), locale);
    assert.equal(routeTitles[locale as 'en'].profileSetup, name, `${locale} tab title`);
  }
});
