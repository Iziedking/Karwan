import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UsdcRates } from './usdcRates.js';
import { memoryStore, sharedRatesReader, stepSharedRates, type HeldRates } from './sharedRate.js';

// 11 Nov 2026, 09:00 in Lagos.
const MORNING = Date.UTC(2026, 10, 11, 8, 0, 0);
const HOUR = 3600_000;

function live(ngn: number, at: number, eur = 0.889): UsdcRates {
  return { rates: { NGN: ngn, USD: 1, EUR: eur, GBP: 0.74, CNY: 6.67, INR: 94.4, AED: 3.67, KES: 129.9, XOF: 583.2 }, updatedAt: at, source: 'coingecko' };
}
const NONE: UsdcRates = { rates: {}, updatedAt: null, source: null };

test('the first reading becomes the shared rate', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  assert.equal(held?.rates.NGN?.rate, 1346);
  assert.equal(held?.rates.NGN?.setAt, MORNING);
  assert.equal(held?.checkedAt, MORNING);
});

test('a move of half a percent or less inside the day changes nothing', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  const later = stepSharedRates(held, live(1346 * 1.005, MORNING + HOUR), MORNING + HOUR);
  assert.equal(later?.rates.NGN?.rate, 1346);
  assert.equal(later?.rates.NGN?.setAt, MORNING);
  assert.equal(later?.checkedAt, MORNING + HOUR, 'the check is still recorded');
});

test('a move above half a percent moves that currency and no other', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  const later = stepSharedRates(held, live(1354, MORNING + HOUR, 0.8891), MORNING + HOUR);
  assert.equal(later?.rates.NGN?.rate, 1354);
  assert.equal(later?.rates.NGN?.setAt, MORNING + HOUR);
  assert.equal(later?.rates.EUR?.rate, 0.889, 'the euro barely moved, so it stays');
  assert.equal(later?.rates.EUR?.setAt, MORNING);
});

test('a fall counts the same as a rise', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  const later = stepSharedRates(held, live(1338, MORNING + HOUR), MORNING + HOUR);
  assert.equal(later?.rates.NGN?.rate, 1338);
});

test('every currency is set again at the start of the day in Lagos', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  // 23:30 in Lagos is the same day; 00:30 is the next.
  const lateNight = Date.UTC(2026, 10, 11, 22, 30, 0);
  const same = stepSharedRates(held, live(1347, lateNight), lateNight);
  assert.equal(same?.rates.NGN?.rate, 1346);
  const afterMidnight = Date.UTC(2026, 10, 11, 23, 30, 0);
  const next = stepSharedRates(same, live(1347, afterMidnight, 0.8891), afterMidnight);
  assert.equal(next?.rates.NGN?.rate, 1347);
  assert.equal(next?.rates.EUR?.rate, 0.8891);
  assert.equal(next?.rates.NGN?.setAt, afterMidnight);
});

test('with the sources down the held rate stays as it is', () => {
  const held = stepSharedRates(null, live(1346, MORNING), MORNING);
  assert.equal(stepSharedRates(held, NONE, MORNING + HOUR), held);
  assert.equal(stepSharedRates(null, NONE, MORNING), null);
});

function reader(store = memoryStore()) {
  let feed: UsdcRates = NONE;
  const read = sharedRatesReader({ store, live: async () => feed });
  return { read, store, set: (next: UsdcRates) => { feed = next; } };
}

test('everyone reads the same rate while the market drifts', async () => {
  const r = reader();
  r.set(live(1346, MORNING));
  const first = await r.read(MORNING);
  r.set(live(1349, MORNING + HOUR));
  const second = await r.read(MORNING + HOUR);
  assert.equal(first.rates.NGN, 1346);
  assert.equal(second.rates.NGN, 1346);
  assert.equal(second.updatedAt, MORNING, 'the time is when the rate was set');
  assert.equal(second.source, 'coingecko');
});

test('a second server reads the rate the first one set', async () => {
  const store = memoryStore();
  const a = reader(store);
  const b = reader(store);
  a.set(live(1346, MORNING));
  await a.read(MORNING);
  b.set(live(1348, MORNING + 5 * 60_000));
  const out = await b.read(MORNING + 5 * 60_000);
  assert.equal(out.rates.NGN, 1346);
});

test('the held rate is kept for six hours without a check, then there is no rate', async () => {
  const r = reader();
  r.set(live(1346, MORNING));
  await r.read(MORNING);
  r.set(NONE);
  assert.equal((await r.read(MORNING + 5 * HOUR)).rates.NGN, 1346);
  assert.deepEqual(await r.read(MORNING + 7 * HOUR), { rates: {}, updatedAt: null, source: null });
  r.set(live(1350, MORNING + 8 * HOUR));
  assert.equal((await r.read(MORNING + 8 * HOUR)).rates.NGN, 1346, 'back inside half a percent, the held rate returns');
});

test('no rate at all before the first reading', async () => {
  const r = reader();
  assert.deepEqual(await r.read(MORNING), { rates: {}, updatedAt: null, source: null });
});

test('a store that fails does not stop the rate being read', async () => {
  let held: HeldRates | null = null;
  const broken = {
    load: async () => { throw new Error('db down'); },
    save: async (next: HeldRates) => { held = next; throw new Error('db down'); },
  };
  let feed = live(1346, MORNING);
  const read = sharedRatesReader({ store: broken, live: async () => feed });
  assert.equal((await read(MORNING)).rates.NGN, 1346);
  feed = live(1349, MORNING + HOUR);
  assert.equal((await read(MORNING + HOUR)).rates.NGN, 1346, 'this server still holds what it set');
  assert.ok(held);
});

test('nothing outside rates reads the live market rate', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { join, sep } = await import('node:path');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.ts$/.test(entry.name) && !path.includes(`${sep}rates${sep}`) && readFileSync(path, 'utf8').includes('readUsdcRates')) offenders.push(path);
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'read the shared rate (readSharedRates) so every figure agrees');
});
