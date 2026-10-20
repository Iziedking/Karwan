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
