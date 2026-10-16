import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newestFirst, surveyCsv, surveySections, type SurveyAnswer, type SurveySummary } from './surveyPresentation';

const answer = (over: Partial<SurveyAnswer>): SurveyAnswer => ({
  id: 'a',
  createdAt: Date.UTC(2026, 9, 16, 11, 50),
  locale: 'en',
  role: 'seller',
  checks: ['reviews', 'other'],
  otherText: null,
  trustMost: 'past_work',
  easiestFake: 'reviews',
  share: 'if_i_choose',
  payer: 'checker',
  contact: null,
  ...over,
});

const summary: SurveySummary = {
  total: 4,
  withContact: 3,
  role: { seller: 2, buyer: 1, both: 1, platform: 0 },
  checks: { reviews: 3, past_work: 1, vouch: 0, id: 0, test_job: 2, nothing: 0, other: 1 },
  trustMost: { reviews: 0, past_work: 3, vouch: 1, id: 0, test_job: 0 },
  easiestFake: { reviews: 4, past_work: 0, vouch: 0, id: 0, test_job: 0 },
  share: { yes: 1, if_i_choose: 2, one_deal: 1, no: 0 },
  payer: { checker: 1, app: 2, free: 1, not_sure: 0 },
};

test('one section per question, in the order people answered, worded as they saw it', () => {
  const sections = surveySections(summary);
  assert.deepEqual(sections.map((s) => s.question), [
    'Which describes you best?',
    'Before you deal with someone new online, what do you check?',
    'Trust most',
    'Easiest to fake',
    'Would you let your good record follow you to other apps?',
    'When someone checks your record before a deal, who should pay for the check?',
  ]);
  const role = sections[0]!;
  assert.deepEqual(role.rows.map((r) => [r.label, r.count, r.percent]), [
    ['I sell my work or goods', 2, 50],
    ['I hire people or buy from them', 1, 25],
    ['I do both', 1, 25],
    ['I run a marketplace or platform', 0, 0],
  ]);
  assert.equal(sections[1]!.multi, true);
  assert.equal(sections[0]!.multi, false);
});

test('no answers yet gives zero percent, never NaN', () => {
  const empty = surveySections({ ...summary, total: 0 });
  assert.ok(empty.every((s) => s.rows.every((r) => Number.isFinite(r.percent))));
});

test('answers read newest first without changing the list it was given', () => {
  const list = [answer({ id: 'old', createdAt: 1 }), answer({ id: 'new', createdAt: 3 }), answer({ id: 'mid', createdAt: 2 })];
  assert.deepEqual(newestFirst(list).map((a) => a.id), ['new', 'mid', 'old']);
  assert.equal(list[0]!.id, 'old');
});

test('the CSV has one row per answer, newest first, and keeps commas, quotes and formulas harmless', () => {
  const csv = surveyCsv([
    answer({ id: 'old', createdAt: Date.UTC(2026, 9, 1), contact: 'ada@example.com' }),
    answer({ id: 'new', createdAt: Date.UTC(2026, 9, 16), otherText: 'LinkedIn, "mutuals"', contact: '=HYPERLINK("x")', locale: 'fr' }),
  ]);
  const lines = csv.split('\n');
  assert.equal(lines[0], 'submitted_utc,language,role,checks,other,trust_most,easiest_fake,share,payer,contact');
  assert.equal(lines.length, 3);
  assert.ok(lines[1]!.startsWith('2026-10-16T00:00:00.000Z,fr,'));
  assert.match(lines[1]!, /"LinkedIn, ""mutuals"""/);
  assert.match(lines[1]!, /"'=HYPERLINK\(""x""\)"$/);
  assert.match(lines[1]!, /,Reviews or star ratings; Something else,/);
  assert.match(lines[2]!, /ada@example\.com$/);
});

test('the Survey page sits in the admin menu and the admin route maps to it', () => {
  const nav = readFileSync(new URL('./adminNavigation.ts', import.meta.url), 'utf8');
  assert.match(nav, /href: '\/admin\/survey'/);
  const catalog = readFileSync(new URL('./routeCatalog.ts', import.meta.url), 'utf8');
  assert.match(catalog, /\/\^\\\/api\\\/admin\\\/research\/, \{ href: '\/admin\/survey'/);
});
