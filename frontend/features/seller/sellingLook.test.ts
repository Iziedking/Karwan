import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { requestFlowCopy } from '../../shared/i18n/messages/requestFlow';

/// Post an offer and Start a deal in the new look (view 48, batch 9b, Figma
/// page "Batch 9 · Selling and starting a deal").
///
///   npx tsx --test features/seller/sellingLook.test.ts

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const offer = source('./components/PostListingForm.tsx');
const direct = source('../deals/components/DirectDealForm.tsx');

const FILES = {
  offer,
  direct,
  acceptWithin: source('../deals/components/AcceptWithin.tsx'),
  termsBuilder: source('../deals/terms/TermsBuilder.tsx'),
};

test('no green outside the one main button: no accent marks, no positive colour, no hand-made green buttons', () => {
  for (const [name, s] of Object.entries(FILES)) {
    assert.doesNotMatch(s, /--lp-accent/, name);
    assert.doesNotMatch(s, /--color-positive/, name);
    assert.doesNotMatch(s, /rgba\(\s*175\s*,\s*201\s*,\s*91/, name);
    assert.doesNotMatch(s, /uppercase tracking-\[/, name);
    assert.doesNotMatch(s, /font-extrabold/, name);
  }
});

test('both forms are one screen: no steps, no Continue, the terms fold under Pay in parts', () => {
  for (const [name, s] of [['offer', offer], ['direct', direct]] as const) {
    assert.doesNotMatch(s, /rs\.stepOf/, name);
    assert.doesNotMatch(s, /rs\.continue/, name);
    assert.doesNotMatch(s, /setStep\(/, name);
    assert.match(s, /label=\{rf\.payInParts\}[\s\S]{0,800}?\n\s*payInParts\n/, name);
    assert.match(s, /<TermsBuilder/, name);
    assert.match(s, /<TermsBlockerNote /, name);
    assert.match(s, /<CreationReview/, name);
    assert.match(s, /<Button\b[\s\S]*?loading=\{submitting(?: \|\| preparing)?\}/, name);
  }
});

test('the fold row marks Pay in parts for the page and its tests', () => {
  assert.match(source('../deals/components/FoldRow.tsx'), /'data-pay-in-parts'/);
});

test('an offer is checked once more before it posts, and publishing turns', () => {
  assert.match(offer, /loadingLabel=\{f\.publishing\}/);
  assert.match(offer, /reviewing \? f\.publish : t\.dealCreation\.review/);
  assert.match(offer, /stepOneBlocker\(/);
});

test('a direct deal names what is delivered in its own box when it is one payment', () => {
  assert.match(direct, /t\.editDealModal\.deliverLabel/);
  assert.match(direct, /loadingLabel=\{dd\.submit\.opening\}/);
});

test('the fold label exists in every language', () => {
  for (const [locale, copy] of Object.entries(requestFlowCopy)) assert.ok(copy.payInParts.length > 3, locale);
});

test('an offer drafts its parts from the words on Review, and Pay in parts shows only once there are parts (view 56)', () => {
  // Drafted as an offer: split only when its words name stages (view 66).
  assert.match(offer, /api\.dealDraft\(words, 'offer'\)/);
  assert.match(offer, /\{inParts \? \(\s*<FoldRow\s+label=\{rf\.payInParts\}/);
  assert.match(offer, /data-drafted/);
});
