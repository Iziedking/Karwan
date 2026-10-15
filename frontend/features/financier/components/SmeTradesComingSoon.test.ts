import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { en } from '../../../shared/i18n/messages/en';

const source = readFileSync(new URL('./SmeTradesComingSoon.tsx', import.meta.url), 'utf8');

test('the finance soon page says plainly what is coming, in every language, with one working way on', () => {
  // Every word comes from the messages, so nothing on it stays English.
  assert.match(source, /useTranslations\(\)\.financeSoon/);
  assert.doesNotMatch(source, />\s*[A-Z][a-z]+ [a-z]+[^<{]*</);
  // It never links to itself, and goes where the plan is written down.
  assert.doesNotMatch(source, /href="\/financier"/);
  assert.match(source, /href="\/docs\/roadmap"/);
  assert.match(source, /text-\[36px\] font-medium[^"]*sm:text-\[40px\]/);
  assert.doesNotMatch(source, /'00\d'|HeroHeadline|Punc|SectionTag/);
});

test('the copy names no internals and makes no public-record claim', () => {
  const words = JSON.stringify(en.financeSoon);
  assert.doesNotMatch(words, /\bArc\b|on-chain|\brail\b|concentration|repayment behaviour/i);
  assert.equal(en.financeSoon.title, 'Finance');
});
