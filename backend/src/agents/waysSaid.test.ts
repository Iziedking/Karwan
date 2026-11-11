import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsdcRates } from '../rates/usdcRates.js';
import { waysSchema, type AgentWays } from './ways.js';
import { refreshSaidWays, waysAtRate } from './waysSaid.js';

/// Prices a person gives their agent in their own currency (view 77): the
/// typed figure is the rule, and the USDC follows the shared rate.

const at = (ngn: number): UsdcRates => ({ rates: { NGN: ngn }, updatedAt: 1, source: 'coingecko' });
const NONE: UsdcRates = { rates: {}, updatedAt: null, source: null };

const typed = (min: string, usual: string, usdc: { min: number; usual: number }): AgentWays => ({
  sell: [{
    shape: 'one_time', priceMin: usdc.min, priceUsual: usdc.usual, daysMin: 1, daysMax: 7,
    said: { currency: 'NGN', amounts: { priceMin: { amount: min }, priceUsual: { amount: usual } } },
  }],
  buy: [],
});

test('at save the USDC is worked out from the figure typed, and the schema keeps it', () => {
  const sent = waysSchema.parse(typed('30000', '60000', { min: 20, usual: 40 }));
  const { ways } = waysAtRate(sent, at(1500), true);
  const way = ways.sell[0]!;
  assert.equal(way.shape === 'one_time' && way.priceMin, 20);
  assert.equal(way.shape === 'one_time' && way.priceUsual, 40);
  assert.deepEqual(way.said?.amounts.priceMin, { amount: '30000', usdc: 20 });
});

test('when the rate moves the rule stays the typed figure and the USDC follows', () => {
  const saved = waysAtRate(typed('30000', '60000', { min: 20, usual: 40 }), at(1500), true).ways;
  const next = waysAtRate(saved, at(1600));
  assert.equal(next.changed, true);
  const way = next.ways.sell[0]!;
  assert.equal(way.shape === 'one_time' && way.priceMin, 18.75);
  assert.equal(way.shape === 'one_time' && way.priceUsual, 37.5);
  assert.equal(way.said?.amounts.priceMin?.amount, '30000');
  assert.equal(waysAtRate(next.ways, at(1600)).changed, false, 'the same rate changes nothing');
});

test('a rule changed in USDC by something else loses its typed figure', () => {
  const saved = waysAtRate(typed('30000', '60000', { min: 20, usual: 40 }), at(1500), true).ways;
  const way = saved.sell[0]!;
  const edited: AgentWays = { ...saved, sell: [{ ...way, priceMin: 25 } as typeof way] };
  const next = waysAtRate(edited, at(1600)).ways.sell[0]!;
  assert.equal(next.shape === 'one_time' && next.priceMin, 25, 'the new USDC is left alone');
  assert.equal(next.said?.amounts.priceMin, undefined);
  assert.equal(next.shape === 'one_time' && next.priceUsual, 37.5, 'the untouched rule still follows its figure');
});

test('with no rate, or a rule typed in USDC, nothing changes', () => {
  const saved = waysAtRate(typed('30000', '60000', { min: 20, usual: 40 }), at(1500), true).ways;
  assert.equal(waysAtRate(saved, NONE).changed, false);
  const plain: AgentWays = { sell: [{ shape: 'hourly', rateMin: 5, rateUsual: 8, hoursMax: 20 }], buy: [{ shape: 'one_time', maxPrice: 100, needDays: 7 }] };
  assert.equal(waysAtRate(plain, at(1600)).changed, false);
});

test('a figure at save that does not match the USDC sent with it is not kept', () => {
  const { ways } = waysAtRate(typed('30000', '60000', { min: 21.5, usual: 40 }), at(1500), true);
  const way = ways.sell[0]!;
  assert.equal(way.shape === 'one_time' && way.priceMin, 21.5);
  assert.equal(way.said?.amounts.priceMin, undefined);
  assert.deepEqual(way.said?.amounts.priceUsual, { amount: '60000', usdc: 40 });
});

test('a move that would break a rule against one kept in USDC leaves the way as it was', () => {
  // The lowest follows naira; the usual was given in USDC. A stronger naira
  // would lift the lowest above the usual, so the way is left alone.
  const mixed: AgentWays = {
    sell: [{ shape: 'one_time', priceMin: 20, priceUsual: 21, daysMin: 1, daysMax: 7, said: { currency: 'NGN', amounts: { priceMin: { amount: '30000', usdc: 20 } } } }],
    buy: [],
  };
  const next = waysAtRate(mixed, at(1200));
  assert.equal(next.changed, false);
});

test('every account with a typed rule is brought to the new rate, and only those', async () => {
  const saved = waysAtRate(typed('30000', '60000', { min: 20, usual: 40 }), at(1500), true).ways;
  const profiles = [
    { address: '0xa', agentWays: saved },
    { address: '0xb', agentWays: { sell: [{ shape: 'hourly' as const, rateMin: 5, rateUsual: 8, hoursMax: 20 }], buy: [] } },
    { address: '0xc' },
  ];
  const writes: Array<{ address: string; ways: AgentWays }> = [];
  const n = await refreshSaidWays({
    list: async () => profiles,
    rates: async () => at(1600),
    save: async (profile, ways) => { writes.push({ address: profile.address, ways }); },
  });
  assert.equal(n, 1);
  assert.equal(writes[0]!.address, '0xa');
  const way = writes[0]!.ways.sell[0]!;
  assert.equal(way.shape === 'one_time' && way.priceMin, 18.75);
});
