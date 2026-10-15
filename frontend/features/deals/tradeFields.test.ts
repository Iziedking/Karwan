import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const forms = {
  request: read('../buyer/components/PostJobForm.tsx'),
  direct: read('./components/DirectDealForm.tsx'),
  offer: read('../seller/components/PostListingForm.tsx'),
};

test('business trade fields follow the UI rules in both buyer forms', () => {
  for (const [name, src] of [['request', forms.request], ['direct', forms.direct]] as const) {
    assert.doesNotMatch(src, /<select/, `${name}: no native select`);
    assert.doesNotMatch(src, /title=\{tt\.incotermGloss/, `${name}: no browser tooltip`);
    assert.match(src, /tt\.incotermGloss\[incoterms\]/, `${name}: the chosen rule is explained on the page`);
    assert.doesNotMatch(src, /Hashes anchor|Hashing…|d\.hash\.slice/, `${name}: no hashes shown to people`);
    assert.match(src, /tt\.documentsHint/, `${name}: the files note is translated`);
    assert.doesNotMatch(src, /eyebrow="Trade context"/, `${name}: no hardcoded English`);
    assert.doesNotMatch(src, /mono text-\[14px\] uppercase tracking-\[0\.14em\] font-bold px-3/, `${name}: chips in sentence case`);
  }
  assert.doesNotMatch(forms.direct, /label="(Company|Sector|Region)"/);
  assert.doesNotMatch(forms.direct, /^\s*Verified\s*$/m);
  assert.doesNotMatch(forms.direct, /^\s*\{opt\}\s*$/m, 'trade type shows its translated name');
});

test('nothing in the three deal forms is under 14px', () => {
  for (const [name, src] of Object.entries(forms)) {
    assert.doesNotMatch(src, /text-\[(9|1[0-3])(\.\d+)?px\]/, name);
  }
});

test('the new trade labels exist in every language', () => {
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw']) {
    const src = read(`../../shared/i18n/messages/${locale}.ts`);
    for (const key of ['eyebrow', 'documentsHint', 'verified', 'theirCompany', 'theirSector', 'theirRegion']) {
      const block = src.slice(src.search(/tradeTerms: \{\s*sectionTitle: ['"]/));
      assert.match(block.slice(0, 4000), new RegExp(`\\b${key}: ['"]`), `${locale} ${key}`);
    }
  }
});
