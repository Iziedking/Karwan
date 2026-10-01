import assert from 'node:assert/strict';
import test from 'node:test';
import { termsFloorMs } from './releaseWindow.js';
import type { DirectDeal } from '../db/deals.js';

const DAY = 86_400_000;
const deal = (over: Partial<DirectDeal>) => ({ dealAmountUsdc: '100', ...over }) as DirectDeal;

test('the agreed check window is the floor for a service deal', () => {
  assert.equal(termsFloorMs(deal({})), 0);
  assert.equal(termsFloorMs(deal({ reviewWindowDays: 3 })), 3 * DAY);
});

test('longer built-in rules still win over a shorter agreed window', () => {
  assert.equal(termsFloorMs(deal({ reviewWindowDays: 3, paymentTerms: 'net30' })), 30 * DAY);
  assert.equal(termsFloorMs(deal({ reviewWindowDays: 45, paymentTerms: 'net30' })), 45 * DAY);
});

test('confirmed arrival lifts the goods floor but never the agreed window', () => {
  assert.equal(termsFloorMs(deal({ reviewWindowDays: 5, tradeType: 'goods', shipment: { arrivedAt: 1 } as never })), 5 * DAY);
});
