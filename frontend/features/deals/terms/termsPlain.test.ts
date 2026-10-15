import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { TERMS_COPY } from './termsCopy';
import { termsBlocker } from './termsBlocker';
import { durationText } from '../durationText';
import { DEFAULT_TERMS } from './TermsBuilder';

const en = TERMS_COPY.en;

test('the reason the form cannot go on is said in plain words, one at a time', () => {
  assert.equal(termsBlocker(DEFAULT_TERMS, en), 'Say what milestone 1 delivers.');
  assert.equal(termsBlocker({ ...DEFAULT_TERMS, parts: [{ pct: 100, what: 'logo' }] }, en), '"logo" is very short. Say exactly what is delivered.');
  assert.equal(termsBlocker({ ...DEFAULT_TERMS, parts: [{ pct: 60, what: 'First draft' }, { pct: 30, what: 'Final files' }] }, en), 'The parts add up to 90%. They need to make 100%.');
  assert.equal(termsBlocker({ ...DEFAULT_TERMS, parts: [{ pct: 100, what: 'Final logo files' }] }, en), null);
});

test('the terms speak plainly in every language: no arbiter, no escrow, the default rule in the open', () => {
  const jargon = /arbiter|arbitre|محكّم|मध्यस्थ|msuluhishi|escrow|séquestre|الضمان|एस्क्रो/i;
  for (const [locale, t] of Object.entries(TERMS_COPY)) {
    const visible = [t.title, t.lead, t.reviewRule, t.agreementNote, ...Object.values(t.text)].join(' ');
    assert.doesNotMatch(visible, jargon, `${locale} still uses jargon`);
    assert.ok(t.reviewRule.length > 20, `${locale} states what happens when the buyer does not reply`);
    assert.equal('soon' in t, false, `${locale} has no "soon" options`);
  }
});

test('the builder shows only choices that work, and the default rule is on the page, not in a tooltip', () => {
  const src = readFileSync(new URL('./TermsBuilder.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /aria-disabled|t\.soon|t\.goods|t\.kind/);
  assert.match(src, /<p[^>]*>\{t\.reviewRule\}<\/p>/);
});

test('every form that uses the terms says why it cannot go on yet', () => {
  for (const file of ['../../buyer/components/PostJobForm.tsx', '../components/DirectDealForm.tsx', '../../seller/components/PostListingForm.tsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /<TermsBlockerNote /, file);
  }
});

test('durations read in days, with hours only when someone chose hours', () => {
  const units = { day: '1 day', days: '{n} days', hr: 'hr', min: 'min' };
  assert.equal(durationText({ days: 7, hours: 0 }, units), '7 days');
  assert.equal(durationText({ days: 1, hours: 0 }, units), '1 day');
  assert.equal(durationText({ days: 0, hours: 5 }, units), '5 hr');
  assert.equal(durationText({ days: 2, hours: 3 }, units), '2 days 3 hr');
  assert.equal(durationText({ days: 0, hours: 0, minutes: 30 }, units), '30 min');
  const direct = readFileSync(new URL('../components/DirectDealForm.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(direct, /submitDays \* 24 \+ submitHours/);
});
