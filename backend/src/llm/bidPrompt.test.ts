import assert from 'node:assert/strict';
import test from 'node:test';

import type { SellerProfile } from '../agents/seller-profile.js';
import { buildBidEvaluationPrompt, type JobContext } from './prompts.js';

/// The model judges only whether a request fits what the seller does; price and
/// time are decided in code by limits.ts (view 41, 30 Oct 2026). Found on
/// testnet, request 0xfb2f: the prompt read a usual price of 500 as a maximum
/// and counted 9 days where the limits counted 10, and a fitting seller skipped.

const DAY = 86_400;

const cotton: SellerProfile = {
  walletId: 'wallet-1',
  address: '0x60d921870bec83e8ce4a824c8e7d05c74a1f88a8',
  userAddress: '0xbbb45de4771e5f465f800785bb919ea35ad813d7',
  displayName: 'Sahel Cotton',
  skills: ['cotton lint', 'woven cotton fabric', 'cotton', 'fabric'],
  bio: 'Cotton lint and woven cotton fabric, by the bale and roll',
  minBudgetUsdc: 400,
  maxBudgetUsdc: 500,
  usualPriceUsdc: 500,
  minDeadlineDays: 10,
  maxDeadlineDays: 10,
  confidenceThreshold: 0.5,
  keywords: ['cotton', 'fabric'],
};

const request = (): JobContext => ({
  jobId: '0xfb2f',
  buyer: '0xbuyer',
  budgetUsdc: '600',
  deadlineUnix: Math.floor(Date.now() / 1000) + Math.round(9.3 * DAY),
  termsHash: '0xterms',
  buyerReputationBps: 5_000,
  briefText: 'Cotton fabric and yarn from West African mills',
});

test('a budget above the usual price is never a reason to skip', () => {
  const prompt = buildBidEvaluationPrompt(request(), cotton);
  assert.doesNotMatch(prompt, /Maximum acceptable price/);
  assert.doesNotMatch(prompt, /budget-in-range/);
  assert.match(prompt, /Usual price: 500 USDC/);
  assert.match(prompt, /above the usual price is a bigger deal/);
});

test('the decision is the topical fit alone', () => {
  const prompt = buildBidEvaluationPrompt(request(), cotton);
  assert.doesNotMatch(prompt, /Hard range checks/);
  assert.match(prompt, /decision: "bid" when the topical match passes/);
});

test('days are counted the way the limits count them, rounding up', () => {
  const prompt = buildBidEvaluationPrompt(request(), cotton);
  assert.match(prompt, /Days until buyer's deadline: 10/);
  assert.match(prompt, /suggestedDeadlineDays: integer in \[10, 10\]/);
});
