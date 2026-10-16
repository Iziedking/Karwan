import assert from 'node:assert/strict';
import test from 'node:test';
import { deskNudges } from './deskNudges';
import type { BidLine, SellerDesk } from './sellerDeskView';
import { agentNudgesCopy } from '@/shared/i18n/messages/agentNudges';

const copy = agentNudgesCopy.en;
const line = (over: Partial<BidLine> = {}): BidLine => ({
  jobId: '0xj1', title: 'Logo', state: 'offered', priceUsdc: '80', withdrawable: true, check: null, ...over,
});
const desk = (bidding: BidLine[], needsYou: SellerDesk['needsYou'] = []): SellerDesk => ({ needsYou, bidding, offers: [], empty: false });
const check = { paidUsdc: 0.01, completed: 2, repeatSellers: 0, disputesLost: 0, score: 40, flag: null, late: false };

test('the first load gives no nudges', () => {
  assert.deepEqual(deskNudges(null, desk([line()]), copy), []);
});

test('a new bid with a buyer check gives the check, then the offer', () => {
  const out = deskNudges(desk([]), desk([line({ check })]), copy);
  assert.deepEqual(out, ['Your agent paid 0.01 USDC to check the buyer on Logo', 'Your agent offered 80 USDC on Logo']);
});

test('state changes and a buyer choosing you each say so once', () => {
  const before = desk([line(), line({ jobId: '0xj2', title: null })]);
  const after = desk(
    [line({ state: 'negotiating' }), line({ jobId: '0xj2', title: null, state: 'passed', check })],
    [{ jobId: '0xj3', title: 'Menu', priceUsdc: '90' }],
  );
  assert.deepEqual(deskNudges(before, after, copy), [
    'Your agent is negotiating Logo',
    'Your agent passed on a request',
    'A match on Menu needs you',
  ]);
  assert.deepEqual(deskNudges(after, after, copy), []);
});
