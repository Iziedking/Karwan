import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentQuestion } from '@/core/api';
import { agentQuestionsCopy } from '@/shared/i18n/messages/agentQuestions';
import { questionLine, questionShape } from './agentQuestionCard';
import { fillMoney } from '../money/moneyText';

const copy = agentQuestionsCopy.en;
const base: AgentQuestion = {
  id: 'q1',
  side: 'seller',
  jobId: '0x' + '1'.repeat(64),
  kind: 'price-below-floor',
  title: 'Logo',
  facts: { budgetUsdc: '80', dueDays: 5, limit: 90 },
  suggested: { priceUsdc: '90', days: 3 },
  state: 'input-required',
  createdAt: 1,
  updatedAt: 1,
};

test('a request question is answered with an offer, a counter question acts on the counter, the near match has its own card', () => {
  assert.equal(questionShape('price-below-floor'), 'request');
  assert.equal(questionShape('ask-first'), 'request');
  assert.equal(questionShape('counter-below-floor'), 'counter');
  assert.equal(questionShape('last-price-passed'), 'counter');
  assert.equal(questionShape('price-above-cap'), null);
});

test('the card line names the budget, the limit and the suggested answer', () => {
  assert.equal(questionLine(copy, base), 'The budget is 80 USDC, under your lowest of 90 USDC. Offer 90 USDC?');
  assert.equal(
    questionLine(copy, { ...base, kind: 'no-way', facts: { budgetUsdc: '80', dueDays: 5, limit: null }, suggested: { priceUsdc: '80', days: 1 } }),
    'The budget is 80 USDC. You have not told your agent how you sell this yet. Offer 80 USDC, ready in 1 day?',
  );
  assert.equal(
    questionLine(copy, { ...base, kind: 'time', facts: { budgetUsdc: '80', dueDays: 2, limit: 7 }, suggested: { priceUsdc: '80', days: 7 } }),
    'It is due in 2 days. You usually take 7 days. Offer 80 USDC in 7 days?',
  );
  assert.equal(
    questionLine(copy, { ...base, kind: 'counter-below-floor', facts: { budgetUsdc: '100', dueDays: 5, limit: 90, theirPriceUsdc: '85' }, suggested: { priceUsdc: '90', days: 5 } }),
    'The buyer offers 85 USDC. Your lowest is 90 USDC. Take it, or hold at 90 USDC?',
  );
});

test('with a money filler, every amount in the line reads in the chosen currency', () => {
  const money = (template: string, amounts: Record<string, string | number | null | undefined>, vars: Record<string, string>) =>
    fillMoney(template, Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, v === null || v === undefined ? null : Number(v)])), 'NGN', 1346.11, 'en', vars);
  assert.equal(
    questionLine(copy, base, money),
    'The budget is ₦107,689 · 80.00 USDC, under your lowest of ₦121,150 · 90.00 USDC. Offer ₦121,150 · 90.00 USDC?',
  );
  assert.equal(
    questionLine(copy, { ...base, kind: 'time', facts: { budgetUsdc: '80', dueDays: 2, limit: 7 }, suggested: { priceUsdc: '80', days: 7 } }, money),
    'It is due in 2 days. You usually take 7 days. Offer ₦107,689 · 80.00 USDC in 7 days?',
  );
});
