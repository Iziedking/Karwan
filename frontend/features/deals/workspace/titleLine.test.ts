import assert from 'node:assert/strict';
import test from 'node:test';
import type { DealView, DirectDeal } from '@/core/api';
import { dealPageCopy } from '@/shared/i18n/messages/dealPage';
import { titleMoneyLine, whatItIs } from './titleLine';
import { momentFor } from './momentLine';

/// The top of a deal and this moment (view 44, rules 1 and 3).
///
///   npx tsx --test features/deals/workspace/titleLine.test.ts

const t = dealPageCopy.en;
const NOW = Date.UTC(2026, 10, 1);
const deal = (over: Partial<DirectDeal> = {}) => ({
  jobId: '0xjob', buyer: '0xb', seller: '0xs', dealAmountUsdc: '120', firstReleasePct: 100, terms: 'Logo in 3 versions\nFull, short and icon.',
  delivered: false, createdAt: NOW, updatedAt: NOW, onChain: null, sellerApprovedAt: NOW, acceptedAt: NOW, ...over,
}) as DirectDeal;
const view = (over: Partial<DealView>): DealView => ({
  stage: 'awaiting-final-release', money: { line: 'held' }, progress: [], next: { action: 'release', actor: 'you', amountUsdc: '120' }, automatic: null, hold: null, ...over,
});

test('a deal paid in stages says what is paid out and what Karwan holds', () => {
  const half = deal({ firstReleasePct: 50, milestonePcts: [50, 50], onChain: { state: 2, milestonePcts: [50, 50], milestonesReleased: 1 } as DirectDeal['onChain'] });
  assert.equal(titleMoneyLine(half, 'Ada', t, 'en'), '60 USDC paid to Ada · 60 USDC held by Karwan');
  assert.equal(titleMoneyLine(deal(), 'Ada', t, 'en'), null);
  assert.equal(titleMoneyLine(deal({ firstReleasePct: 50, milestonePcts: [50, 50] }), 'Ada', t, 'en'), null);
});

test('what it is is the first line of the terms', () => {
  assert.equal(whatItIs(deal()), 'Logo in 3 versions');
  assert.equal(whatItIs(deal({ terms: '   ' })), null);
});

test('this moment names whose move it is in plain words', () => {
  assert.deepEqual(momentFor(view({}), 'Ada', t, '120'), { label: 'Your move', sentence: 'Ada delivered. Check it and release the payment.' });
  assert.deepEqual(momentFor(view({ next: { action: 'release', actor: 'counterparty', amountUsdc: '120' } }), 'Chidi', t, '120'), { label: 'Waiting on Chidi', sentence: 'Chidi is checking your delivery.' });
  assert.deepEqual(momentFor(view({ stage: 'awaiting-funding', next: { action: 'fund', actor: 'you', amountUsdc: '120.6' } }), 'Ada', t, '120.60'), { label: 'Your move', sentence: 'Pay in 120.60 USDC so Ada can start.' });
  assert.deepEqual(momentFor(view({ stage: 'awaiting-delivery', next: { action: 'deliver', actor: 'you', amountUsdc: null } }), 'Chidi', t, ''), { label: 'Your move', sentence: 'Send what you made when it is ready.' });
  assert.equal(momentFor(view({ stage: 'settled', next: { action: null, actor: 'nobody', amountUsdc: null } }), 'Ada', t, ''), null);
});
