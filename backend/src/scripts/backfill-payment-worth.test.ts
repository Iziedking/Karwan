import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MoneyMovement } from '../money/model.js';
import { chartsFromText, dayOf, planWorthBackfill, ratesFromCharts, ratesFromHistory } from './backfill-payment-worth.js';

const SENDER = '0x1111111111111111111111111111111111111111';
const ADA = '0x2222222222222222222222222222222222222222';
const MON = Date.UTC(2026, 10, 2, 9);
const TUE = Date.UTC(2026, 10, 3, 9);

const movement = (over: Partial<MoneyMovement>): MoneyMovement => ({
  reference: 'KW-1', operationKey: 'k', kind: 'transfer', state: 'completed', version: 3, attempt: 0, currency: 'USDC',
  amountMicros: '10000000', initiatedBy: SENDER, summary: 's', nextActor: 'none', legs: [], createdAt: MON, updatedAt: MON, completedAt: MON,
  participants: [{ address: SENDER, role: 'owner' }, { address: ADA, role: 'recipient' }],
  ...over,
} as MoneyMovement);

const currencyOf = async (address: string) => (address === SENDER ? ('NGN' as const) : address === ADA ? ('KES' as const) : undefined);
const ratesFor = async (day: string) => (day === '02-11-2026' ? { NGN: 1500, KES: 130 } : day === '03-11-2026' ? { NGN: 1520 } : null);

test('the day of a payment, as the rate source wants it', () => {
  assert.equal(dayOf(MON), '02-11-2026');
});

test('the published prices of a day become rates, and a bad answer becomes none', () => {
  assert.deepEqual(ratesFromHistory({ market_data: { current_price: { ngn: 1500.5, kes: 130, usd: 1, btc: 0.00001 } } }), { NGN: 1500.5, KES: 130, USD: 1 });
  assert.equal(ratesFromHistory({ market_data: {} }), null);
  assert.equal(ratesFromHistory(null), null);
});

test('each older payment gets what it was worth that day, at that day\'s published rate', async () => {
  const plan = await planWorthBackfill({
    movements: [movement({}), movement({ reference: 'KW-2', completedAt: TUE, amountMicros: '20000000' })],
    deals: [],
    currencyOf,
    ratesFor,
  });
  assert.equal(plan.movements.length, 2);
  assert.deepEqual(plan.movements[0]!.worth[SENDER], { currency: 'NGN', amount: '15000', rate: 1500, at: MON });
  assert.deepEqual(plan.movements[0]!.worth[ADA], { currency: 'KES', amount: '1300', rate: 130, at: MON });
  assert.deepEqual(Object.keys(plan.movements[1]!.worth), [SENDER], 'no rate was published for that currency that day, so that side stays about');
  assert.equal(plan.movements[1]!.worth[SENDER]!.amount, '30400');
});

test('what already has its worth, is not completed, or has no rate that day is left alone', async () => {
  const kept = { [SENDER]: { currency: 'NGN' as const, amount: '1', rate: 1, at: 1 } };
  const plan = await planWorthBackfill({
    movements: [
      movement({ worth: kept }),
      movement({ reference: 'KW-3', state: 'verifying', completedAt: undefined }),
      movement({ reference: 'KW-4', completedAt: Date.UTC(2026, 9, 1) }),
    ],
    deals: [],
    currencyOf,
    ratesFor,
  });
  assert.deepEqual(plan.movements, []);
  assert.equal(plan.daysWithoutRates, 1);
});

test('a settled deal gets its worth for the buyer and the seller', async () => {
  const plan = await planWorthBackfill({
    movements: [],
    deals: [
      { jobId: '0xabc', buyer: SENDER, seller: ADA, dealAmountUsdc: '100', settledAt: MON },
      { jobId: '0xdef', buyer: SENDER, seller: ADA, dealAmountUsdc: '100' },
      { jobId: '0x123', buyer: SENDER, seller: ADA, dealAmountUsdc: '100', settledAt: MON, settledWorth: {} },
    ],
    currencyOf,
    ratesFor,
  });
  assert.deepEqual(plan.deals.map((d) => d.jobId), ['0xabc']);
  assert.equal(plan.deals[0]!.worth[SENDER]!.amount, '150000');
  assert.equal(plan.deals[0]!.worth[ADA]!.amount, '13000');
});

test('older rows on one account (yield, refunds, money back from an agent) get their worth too (L-08)', async () => {
  const kept = { currency: 'NGN' as const, amount: '1', rate: 1, at: 1 };
  const plan = await planWorthBackfill({
    movements: [],
    deals: [],
    activity: [
      { id: 'a1', address: SENDER, ts: MON, amountUsdc: '10' },
      { id: 'a2', address: ADA, ts: MON, amountUsdc: '10' },
      { id: 'a3', address: SENDER, ts: MON, amountUsdc: '10', worth: kept },
      { id: 'a4', address: SENDER, ts: MON },
      { id: 'a5', address: SENDER, ts: Date.UTC(2026, 9, 1), amountUsdc: '10' },
    ],
    currencyOf,
    ratesFor,
  });
  assert.deepEqual(plan.activity.map((a) => a.id), ['a1', 'a2']);
  assert.deepEqual(plan.activity[0]!.worth, { currency: 'NGN', amount: '15000', rate: 1500, at: MON });
  assert.equal(plan.activity[1]!.worth.amount, '1300');
});

test('the rates of a day come from the charts: the price nearest noon, and none for a day with no price', async () => {
  const day = Date.UTC(2026, 10, 2);
  const ratesOf = ratesFromCharts({
    NGN: [[day - 3_600_000, 1490], [day + 3_600_000, 1500], [day + 13 * 3_600_000, 1510], [day + 23 * 3_600_000, 1530]],
    KES: [[day + 86_400_000 + 5, 131]],
  });
  assert.deepEqual(await ratesOf('02-11-2026'), { NGN: 1510 });
  assert.deepEqual(await ratesOf('03-11-2026'), { KES: 131 });
  assert.equal(await ratesOf('04-11-2026'), null);
});

test('a prices file keeps only charts of known currencies with real prices', () => {
  const charts = chartsFromText(JSON.stringify({ NGN: [[1, 1500], [2, 0], ['x', 3]], BTC: [[1, 2]], KES: 'no' }));
  assert.deepEqual(charts, { NGN: [[1, 1500]] });
});
