import assert from 'node:assert/strict';
import test from 'node:test';
import type { UserProfile } from '@/core/api';
import { waysCopy } from '@/shared/i18n/messages/ways';
import { blankWay, wayProblem, waysOf, waySummary, type AgentWays, type SellWay } from './ways';
import { fillMoney } from '@/features/money/moneyText';

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
    sell: [{ shape: 'one_time', priceMin: 20, priceUsual: 30, usualGuessed: true, daysMin: 3, daysMax: 3 }],
    buy: [{ shape: 'one_time', maxPrice: 300, needDays: 14 }],
  });
  assert.deepEqual(waysOf({ ...profile, agentWays: ways } as UserProfile), ways);
});

test('each way reads as one line with its price, place and time', () => {
  assert.equal(waySummary('sell', ways.sell[0]!, c), 'Wigs · Usually 190 USDC, lowest 80 · to Anywhere in Nigeria · 2 to 5 days');
  assert.equal(waySummary('buy', ways.buy[0]!, c), 'Up to 5,000 USDC · within 30 days · Stage by stage');
  assert.equal(waySummary('sell', { shape: 'one_time', priceMin: 25, priceUsual: 25, daysMin: 3, daysMax: 3 }, c), '25 USDC · 3 days');
  assert.equal(waySummary('sell', { ...(ways.sell[0] as Extract<SellWay, { shape: 'goods' }>), perItem: true }, c), 'Wigs · Usually 190 USDC, lowest 80 per item · to Anywhere in Nigeria · 2 to 5 days');
});

test('a naira account reads its ways in naira, no USDC (owner, 9 Nov 2026)', () => {
  const say = (template: string, money: Record<string, number>) => fillMoney(template, money, 'NGN', 1346.11, 'en');
  const sell = waySummary('sell', ways.sell[0]!, c, say);
  const buy = waySummary('buy', ways.buy[0]!, c, say);
  assert.doesNotMatch(sell + buy, /USDC/);
  assert.match(sell, /^Wigs · Usually ₦255,7\d\d, lowest ₦107,6\d\d · /);
  assert.match(buy, /^Up to ₦6,730,5\d\d · within 30 days/);
  assert.match(waySummary('sell', { shape: 'deposit', what: 'Servers', deposit: 100, periodDays: 30 }, c, say), /₦134,6\d\d deposit/);
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
  assert.equal((blankWay('sell', 'goods', ways) as { perItem?: boolean }).perItem, true, 'a new goods way is priced per item');
  assert.equal((blankWay('buy', 'goods', ways) as { maxPrice: number }).maxPrice, 5000);
});

test('ways saved before the usual price read safely: a range becomes lowest and usual, and the summary never breaks', () => {
  const saved = {
    agentWays: {
      sell: [
        { shape: 'one_time', priceMin: 20, priceMax: 40, daysMin: 1, daysMax: 3 },
        { shape: 'goods', what: 'Wigs', priceMin: 30, perItem: true, shipsTo: 'Lagos', arriveDaysMin: 2, arriveDaysMax: 5 },
        { shape: 'deposit', what: 'Bike', deposit: 50, periodDays: 7 },
      ],
      buy: [],
    },
  } as unknown as UserProfile;
  const ways = waysOf(saved);
  assert.equal((ways.sell[0] as { priceUsual: number }).priceUsual, 30);
  assert.equal((ways.sell[1] as { priceUsual: number }).priceUsual, 30);
  assert.equal('priceMax' in ways.sell[0]!, false);
  assert.equal((ways.sell[0] as { usualGuessed?: boolean }).usualGuessed, true, 'worked out from a range, not given');
  for (const w of ways.sell) assert.doesNotThrow(() => waySummary('sell', w, waysCopy.en));
});

test('a price typed in your own currency is kept with the way (view 77)', async () => {
  const { withSaidPrice } = await import('./ways');
  const way = { shape: 'one_time', priceMin: 20, priceUsual: 40, daysMin: 1, daysMax: 7 };
  const lowest = withSaidPrice(way, 'priceMin', { currency: 'NGN', amount: '30000' });
  assert.deepEqual((lowest as { said?: unknown }).said, { currency: 'NGN', amounts: { priceMin: { amount: '30000' } } });
  const both = withSaidPrice(lowest, 'priceUsual', { currency: 'NGN', amount: '60000' });
  assert.deepEqual(Object.keys((both as unknown as { said: { amounts: object } }).said.amounts), ['priceMin', 'priceUsual']);
  // Typed again in USDC, that price forgets its figure; the other keeps its own.
  const one = withSaidPrice(both, 'priceMin', null);
  assert.deepEqual((one as unknown as { said: { amounts: object } }).said.amounts, { priceUsual: { amount: '60000' } });
  assert.equal('said' in withSaidPrice(one, 'priceUsual', null), false);
  // A figure in another currency replaces the old ones.
  const euro = withSaidPrice(both, 'priceMin', { currency: 'EUR', amount: '18.50' });
  assert.deepEqual((euro as { said?: unknown }).said, { currency: 'EUR', amounts: { priceMin: { amount: '18.50' } } });
});
