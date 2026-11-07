import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBriefPrice } from './agentBriefParse.js';

/// A usual price and delivery time, read from however a person says it. An
/// answer that cannot be read is null, never a guess.
///
///   npx tsx --test src/agents/agentBriefParse.test.ts

const cases: Array<[string, { min: number; max: number } | null, { minDays: number; maxDays: number } | null]> = [
  ['20 to 40 USDC, 3 days', { min: 20, max: 40 }, { minDays: 3, maxDays: 3 }],
  ['About 100 USDC, a week', { min: 80, max: 120 }, { minDays: 7, maxDays: 7 }],
  ['Up to 50', { min: 0, max: 50 }, null],
  ['$20-$40, 2 weeks', { min: 20, max: 40 }, { minDays: 14, maxDays: 14 }],
  ['20 – 40 dollars, same day', { min: 20, max: 40 }, { minDays: 1, maxDays: 1 }],
  ['75', { min: 75, max: 75 }, null],
  ['3 to 5 days, 30 USDC', { min: 30, max: 30 }, { minDays: 3, maxDays: 5 }],
  ['Depends on size', null, null],
  ['', null, null],
  ['N25k', null, null],
  ['₦25,000 per bag', null, null],
  ['٢٠ إلى ٤٠ USDC', { min: 20, max: 40 }, null],
  ['40 to 20', { min: 20, max: 40 }, null],
  ['from 15 USDC, a month', { min: 15, max: 15 }, { minDays: 30, maxDays: 30 }],
  ['1,200 to 1,500 USDC', { min: 1200, max: 1500 }, null],
];

for (const [text, price, pace] of cases) {
  test(`reads "${text}"`, () => {
    const read = parseBriefPrice(text);
    assert.deepEqual(read.price, price);
    assert.deepEqual(read.pace, pace);
  });
}

/// A person who reads naira answers in naira; the figures become USDC at
/// today's rate (owner, 7 Nov 2026). 1 USDC = 1,500 naira here.
const naira = { currency: 'NGN' as const, rate: 1500 };
const inNaira: Array<[string, { min: number; max: number } | null]> = [
  ['₦30,000 to ₦60,000, 3 days', { min: 20, max: 40 }],
  ['30k to 60k', { min: 20, max: 40 }],
  ['N45,000', { min: 30, max: 30 }],
  ['45000 naira', { min: 30, max: 30 }],
  ['1.5m', { min: 1000, max: 1000 }],
  ['20 to 40 USDC', { min: 20, max: 40 }],
  ['$20 to $40', { min: 20, max: 40 }],
  ['€20 to €40', null],
  ['Depends on size', null],
];
for (const [text, price] of inNaira) {
  test(`reads "${text}" for someone in naira`, () => {
    assert.deepEqual(parseBriefPrice(text, naira).price, price);
  });
}

test('a figure in naira reads back as the naira typed, not a cent off', () => {
  const rate = 1471.37;
  const read = parseBriefPrice('₦30,000', { currency: 'NGN', rate }).price!;
  assert.equal(Math.round(read.min * rate), 30000);
});
