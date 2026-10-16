import assert from 'node:assert/strict';
import test from 'node:test';
import { agentCheckKey, holdFor, nextStep, type AgentWorldHold } from './agentWorldCheck.js';
import type { TrustDecision } from './riskEngine.js';

const decision = (verify: TrustDecision['verify']): TrustDecision => ({
  version: 'trust-v1', level: Object.keys(verify).length ? 'step_up' : 'clear', verify,
  stakeRequired: false, delivery: 'plain', reasons: [], decidedAt: 1,
});
const input = (verify: TrustDecision['verify'], over: Partial<Parameters<typeof holdFor>[1]> = {}) => ({
  jobId: '0xJOB', sellerAgent: '0xSA', priceUsdc: '120', buyerUser: '0xB', sellerUser: '0xS',
  decision: decision(verify), now: 10, ...over,
});

test('nothing to check means no hold', () => {
  assert.equal(holdFor(null, input({})), null);
});

test('a hold names who must check and why, tied to the seller and the price', () => {
  const h = holdFor(null, input({ buyer: 'first_deal', seller: 'large_deal' })) as AgentWorldHold;
  assert.equal(h.key, agentCheckKey('0xsa', '120'));
  assert.deepEqual(h.need, { buyer: 'first_deal', seller: 'large_deal' });
  assert.equal(h.buyer, 'pending');
  assert.equal(h.seller, 'pending');
  assert.equal(h.jobId, '0xjob');
});

test('choosing again at the same seller and price keeps what was already done', () => {
  const first = holdFor(null, input({ buyer: 'first_deal', seller: 'first_deal' }))!;
  const again = holdFor({ ...first, buyer: 'verified' }, input({ buyer: 'first_deal', seller: 'first_deal' }, { now: 20 }))!;
  assert.equal(again.buyer, 'verified');
  assert.equal(again.createdAt, first.createdAt);
});

test('a new price or a new seller starts the checks again', () => {
  const first = { ...holdFor(null, input({ buyer: 'first_deal' }))!, buyer: 'verified' as const };
  assert.equal(holdFor(first, input({ buyer: 'first_deal' }, { priceUsdc: '125' }))!.buyer, 'pending');
  assert.equal(holdFor(first, input({ buyer: 'first_deal' }, { sellerAgent: '0xOTHER' }))!.buyer, 'pending');
});

test('the buyer checks first, then the seller, then money can move', () => {
  const h = holdFor(null, input({ buyer: 'first_deal', seller: 'large_deal' }))!;
  assert.deepEqual(nextStep(h, false), { kind: 'buyer', reason: 'first_deal' });
  assert.deepEqual(nextStep({ ...h, buyer: 'verified' }, false), { kind: 'seller', reason: 'large_deal' });
  assert.deepEqual(nextStep({ ...h, buyer: 'verified', seller: 'verified' }, false), { kind: 'proceed' });
});

test('a skip opens the gate only where skipping is allowed', () => {
  const h = { ...holdFor(null, input({ buyer: 'first_deal' }))!, buyer: 'skipped' as const };
  assert.deepEqual(nextStep(h, true), { kind: 'proceed' });
  assert.deepEqual(nextStep(h, false), { kind: 'buyer', reason: 'first_deal' });
});

test('no hold means proceed', () => {
  assert.deepEqual(nextStep(null, false), { kind: 'proceed' });
});
