import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emptyResearchDraft, researchIssues, researchPayload } from './researchForm';
import { isPublicEditorialRoute } from '../../shared/utils/routes';
import { researchCopy } from '../../shared/i18n/messages/research';

const complete = {
  ...emptyResearchDraft(),
  role: 'seller' as const,
  checks: ['reviews' as const, 'vouch' as const],
  trustMost: 'vouch' as const,
  easiestFake: 'reviews' as const,
  share: 'if_i_choose' as const,
  payer: 'checker' as const,
};

test('every question needs an answer before the form sends, the contact never does', () => {
  assert.deepEqual(researchIssues(emptyResearchDraft()), {
    role: 'required',
    checks: 'pickOne',
    trustMost: 'required',
    easiestFake: 'required',
    share: 'required',
    payer: 'required',
  });
  assert.deepEqual(researchIssues(complete), {});
});

test('the payload carries the answers, the language and the hidden field, and trims the rest', () => {
  const body = researchPayload({ ...complete, contact: '  ada@example.com ', otherText: 'kept only with other' }, 'fr');
  assert.equal(body.locale, 'fr');
  assert.equal(body.contact, 'ada@example.com');
  assert.equal(body.otherText, undefined, 'free text only goes with "something else"');
  assert.equal(body.website, '');
  const withOther = researchPayload({ ...complete, checks: ['other'], otherText: ' a call ' }, 'en');
  assert.equal(withOther.otherText, 'a call');
  assert.equal(researchPayload({ ...complete, contact: '   ' }, 'en').contact, undefined);
});

test('the survey is a public page: no sign-in, no account prompts', () => {
  assert.equal(isPublicEditorialRoute('/research'), true);
});

test('the page follows the UI rules', () => {
  const page = readFileSync(new URL('./ResearchSurvey.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /<select|title=|Loading|text-\[1[0-3]px\]/);
  assert.match(page, /api\.submitResearch\(/);
  assert.match(page, /name="website"/, 'a hidden field for bots');
  assert.match(page, /role="alert"/, 'errors are announced');
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const c = researchCopy[locale];
    for (const text of [c.title, c.q1, c.q2, c.q3, c.q4, c.q5]) assert.doesNotMatch(text, /—/, 'no em dashes');
  }
});
