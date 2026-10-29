import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '@/core/api';
import { waysCopy } from '@/shared/i18n/messages/ways';
import { blankWay, wayProblem, waysOf, waySummary, type AgentWays, type SellWay } from './ways';

/// The website's copy of the ways rules (view 26). The server decides; these
/// keep the form honest about what is missing before Save.

const c = waysCopy.en;
const ways: AgentWays = {
  sell: [{ shape: 'goods', what: 'Wigs', priceMin: 80, priceUsual: 190, shipsTo: 'Anywhere in Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 }],
  buy: [{ shape: 'milestones', maxPrice: 5000, needDays: 30, pay: 'stages' }],
};

test('an account that never saved ways reads one from its settings', () => {
  const profile = {
    seller: { skills: [], bio: '', minBudgetUsdc: 20, maxBudgetUsdc: 40, minDeadlineDays: 3, maxDeadlineDays: 3 },
    buyer: { maxBudgetUsdc: 300, minDeadlineDays: 1, maxDeadlineDays: 14, bidCollectionSeconds: 45, milestonePcts: [100] },
  } as unknown as UserProfile;
  assert.deepEqual(waysOf(profile), {
    sell: [{ shape: 'one_time', priceMin: 20, priceUsual: 30, daysMin: 3, daysMax: 3 }],
    buy: [{ shape: 'one_time', maxPrice: 300, needDays: 14 }],
  });
  assert.deepEqual(waysOf({ ...profile, agentWays: ways } as UserProfile), ways);
});

test('each way reads as one line with its price, place and time', () => {
  assert.equal(waySummary('sell', ways.sell[0]!, c), 'Wigs · Usually 190 USDC, lowest 80 · to Anywhere in Nigeria · 2 to 5 days');
  assert.equal(waySummary('buy', ways.buy[0]!, c), 'Up to 5,000 USDC · within 30 days · Stage by stage');
  assert.equal(waySummary('sell', { shape: 'one_time', priceMin: 25, priceUsual: 25, daysMin: 3, daysMax: 3 }, c), '25 USDC · 3 days');
});

test('the form says what stops a save', () => {
  assert.equal(wayProblem('sell', ways.sell[0]!), null);
  assert.equal(wayProblem('sell', { ...(ways.sell[0] as Extract<SellWay, { shape: 'goods' }>), shipsTo: ' ' }), 'missing');
  assert.equal(wayProblem('sell', { shape: 'one_time', priceMin: 50, priceUsual: 20, daysMin: 1, daysMax: 3 }), 'order');
  assert.equal(wayProblem('sell', { shape: 'milestones', priceMin: 50, priceUsual: 90, daysMin: 1, daysMax: 3, stages: 9 }), 'missing');
  assert.equal(wayProblem('buy', { shape: 'deposit', maxDeposit: NaN }), 'missing');
});

test('a new way opens near what the person already charges', () => {
  assert.deepEqual(blankWay('sell', 'one_time', ways), { shape: 'one_time', priceMin: 80, priceUsual: 190, daysMin: 1, daysMax: 7 });
  assert.equal((blankWay('buy', 'goods', ways) as { maxPrice: number }).maxPrice, 5000);
});
