import assert from 'node:assert/strict';
import test from 'node:test';
import type { Insight } from '../intelligence/insights.js';
import { composeBrief, goalFits, goalWords, type BriefFacts } from './brief.js';

///   npx tsx --test src/agents/brief.test.ts

// 5 Nov 2026 07:00 UTC is 08:00 in Lagos.
const NOW = Date.UTC(2026, 10, 5, 7);

const insight = (key: string, title: string): Insight => ({
  kind: 'slow-request', key, jobId: key, title, numbers: { days: 3, usualDays: 7 }, action: { kind: 'set-request-days', jobId: key, days: 7 }, weight: 1,
});

const empty: BriefFacts = { timeZone: 'Africa/Lagos', newOffers: [], questions: { count: 0, firstDecideAt: null }, dealsWaiting: 0, insights: [], insightsAllowed: 3, goals: [], told: [] };

test('goals match requests on their own words, plural or not', () => {
  assert.deepEqual(goalWords('Find me a logo designer this week'), ['logo', 'designer']);
  assert.deepEqual(goalWords('sell 20 bags of rice this month'), ['bags', 'rice']);
  assert.equal(goalFits(goalWords('find me a logo designer'), 'Need a new logo for my bakery'), true);
  assert.equal(goalFits(goalWords('sell 20 bags of rice'), 'Buying one bag of parboiled rice'), true);
  assert.equal(goalFits(goalWords('tomatoes below 30 a crate'), 'Fresh tomato supply, weekly'), true);
  assert.equal(goalFits(goalWords('a logo designer'), 'Website copy in French'), false);
  assert.equal(goalFits(goalWords('this week'), 'Anything at all'), false);
});

test('nothingToSayIsNoBrief', () => {
  assert.equal(composeBrief(empty, 'en'), null);
  assert.equal(composeBrief({ ...empty, goals: [{ goal: { id: 'g1', kind: 'buy', text: 'a logo', createdAt: 0 }, line: 'nothing', numbers: {} }], told: ['goal-nothing:g1'] }, 'en'), null);
});

test('atMostFiveLinesInOrder', () => {
  const b = composeBrief(
    {
      ...empty,
      newOffers: [{ jobId: 'j1', title: 'Logo', count: 2, bestUsdc: 40 }, { jobId: 'j2', title: 'Rice', count: 1, bestUsdc: 30 }],
      questions: { count: 2, firstDecideAt: Date.UTC(2026, 10, 5, 13, 30) },
      dealsWaiting: 1,
      insights: [insight('i1', 'Logo'), insight('i2', 'Rice')],
      goals: [{ goal: { id: 'g1', kind: 'sell', text: 'sell 20 bags of rice', createdAt: 0 }, line: 'sell', numbers: { fits: 3, offered: 2 } }],
    },
    'en',
  )!;
  assert.deepEqual(b.lines, [
    'Logo: 2 new offers, the best 40 USDC.',
    'Rice: 1 new offer, 30 USDC.',
    '2 questions are waiting on you; the first decides itself at 14:30.',
    '1 deal is waiting on you.',
    'Logo has had no offer for a day. Sellers on similar requests asked for about 7 days; yours allows 3.',
  ]);
  assert.deepEqual(b.insightKeys, ['i1']);
  assert.deepEqual(b.goalKeys, []);
  assert.equal(b.heading, 'Your morning brief');
});

test('insightsNeverMoreThanAllowedToday', () => {
  const b = composeBrief({ ...empty, insights: [insight('i1', 'A'), insight('i2', 'B'), insight('i3', 'C')], insightsAllowed: 1 }, 'en')!;
  assert.deepEqual(b.insightKeys, ['i1']);
  assert.equal(b.lines.length, 1);
  assert.equal(composeBrief({ ...empty, insights: [insight('i1', 'A')], insightsAllowed: 0 }, 'en'), null);
});

test('goalExpiredSaidOnce', () => {
  const g = { goal: { id: 'g1', kind: 'buy' as const, text: 'a logo designer', createdAt: 0 }, line: 'expired' as const, numbers: {} };
  const first = composeBrief({ ...empty, goals: [g] }, 'en')!;
  assert.deepEqual(first.lines, ['Your goal, a logo designer, reached its end date and is closed.']);
  assert.deepEqual(first.goalKeys, ['goal-expired:g1']);
  assert.equal(composeBrief({ ...empty, goals: [g], told: first.goalKeys }, 'en'), null);
});

test('nothingFitsSaidWeeklyNotDaily', () => {
  const g = { goal: { id: 'g2', kind: 'sell' as const, text: 'tomatoes', createdAt: 0 }, line: 'nothing' as const, numbers: {} };
  const b = composeBrief({ ...empty, goals: [g] }, 'en')!;
  assert.deepEqual(b.lines, ['Your goal, tomatoes: no fitting requests yet.']);
  assert.deepEqual(b.goalKeys, ['goal-nothing:g2']);
  assert.equal(composeBrief({ ...empty, goals: [g], told: ['goal-nothing:g2'] }, 'en'), null);
});

test('goal lines for buy, sell and watch', () => {
  const b = composeBrief(
    {
      ...empty,
      goals: [
        { goal: { id: 'a', kind: 'buy', text: 'a logo designer', createdAt: 0 }, line: 'buy', numbers: { offers: 3, bestUsdc: 45, dueAt: Date.UTC(2026, 10, 9, 12) } },
        { goal: { id: 'b', kind: 'buy', text: 'a website', createdAt: 0 }, line: 'buy', numbers: { offers: 0, bestUsdc: 0, dueAt: Date.UTC(2026, 10, 11, 12) } },
        { goal: { id: 'c', kind: 'sell', text: 'rice', createdAt: 0 }, line: 'sell', numbers: { fits: 3, offered: 1 } },
        { goal: { id: 'd', kind: 'watch', text: 'design requests', createdAt: 0 }, line: 'watch', numbers: { count: 4 } },
        { goal: { id: 'e', kind: 'buy', text: 'a printer', createdAt: 0 }, line: 'buy', numbers: { offers: 1, bestUsdc: 80, dueAt: Date.UTC(2026, 10, 6, 12) } },
      ],
    },
    'en',
  )!;
  assert.deepEqual(b.lines, [
    'Your goal, a logo designer: 3 offers in, the best 45 USDC, due 9 Nov.',
    'Your goal, a website: no offers yet, due 11 Nov.',
    'Your goal, rice: 3 requests fit, and your agent offered on 1.',
    'Your goal, design requests: 4 new requests in the markets you watch.',
    'Your goal, a printer: 1 offer in, 80 USDC, due 6 Nov.',
  ]);
});

test('fiveLanguagesNoEmptySlots', () => {
  const full: BriefFacts = {
    ...empty,
    newOffers: [{ jobId: 'j1', title: 'Logo', count: 2, bestUsdc: 40 }, { jobId: 'j2', title: 'Rice', count: 1, bestUsdc: 30 }],
    questions: { count: 1, firstDecideAt: Date.UTC(2026, 10, 5, 13, 30) },
    dealsWaiting: 2,
    insights: [insight('i1', 'Logo')],
    goals: [
      { goal: { id: 'a', kind: 'buy', text: 'x', createdAt: 0 }, line: 'buy', numbers: { offers: 0, bestUsdc: 0, dueAt: NOW + 2 * 86_400_000 } },
      { goal: { id: 'e', kind: 'buy', text: 'y', createdAt: 0 }, line: 'expired', numbers: {} },
    ],
  };
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const b = composeBrief(full, locale)!;
    assert.equal(b.lines.length, 5, locale);
    for (const line of [b.heading, ...b.lines]) assert.doesNotMatch(line, /\{\w+\}|—|undefined|NaN|\*/, `${locale}: ${line}`);
    if (locale !== 'en') assert.notEqual(b.heading, 'Your morning brief');
  }
  const goals: BriefFacts['goals'] = [
    { goal: { id: 'b', kind: 'buy', text: 'x', createdAt: 0 }, line: 'buy', numbers: { offers: 3, bestUsdc: 45, dueAt: NOW } },
    { goal: { id: 'o', kind: 'buy', text: 'o', createdAt: 0 }, line: 'buy', numbers: { offers: 1, bestUsdc: 45, dueAt: NOW } },
    { goal: { id: 'c', kind: 'sell', text: 'z', createdAt: 0 }, line: 'sell', numbers: { fits: 1, offered: 0 } },
    { goal: { id: 'd', kind: 'watch', text: 'w', createdAt: 0 }, line: 'watch', numbers: { count: 1 } },
    { goal: { id: 'n', kind: 'sell', text: 'n', createdAt: 0 }, line: 'nothing', numbers: {} },
  ];
  for (const locale of ['en', 'fr', 'ar', 'hi', 'sw'] as const) {
    const more = composeBrief({ ...empty, goals, questions: { count: 3, firstDecideAt: null } }, locale)!;
    for (const line of more.lines) assert.doesNotMatch(line, /\{\w+\}|undefined|NaN/, `${locale}: ${line}`);
  }
});
