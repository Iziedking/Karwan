import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readUsdcRates, resetUsdcRatesCache, localFigure, DISPLAY_CURRENCIES } from './usdcRates.js';

const NOW = 1_793_865_348_000;

function coingecko(updatedSec = NOW / 1000) {
  return new Response(
    JSON.stringify({
      'usd-coin': { usd: 0.999778, ngn: 1346.11, eur: 0.889118, gbp: 0.741927, cny: 6.67, inr: 94.4, aed: 3.67, kes: 129.91, xof: 583.22, last_updated_at: updatedSec },
    }),
    { status: 200 },
  );
}

function openEr(updatedSec = NOW / 1000) {
  return new Response(
    JSON.stringify({
      result: 'success',
      time_last_update_unix: updatedSec,
      rates: { USD: 1, NGN: 1346.474525, EUR: 0.889912, GBP: 0.742316, CNY: 6.685421, INR: 94.620171, AED: 3.6725, KES: 129.871619, XOF: 583.747262 },
    }),
    { status: 200 },
  );
}

function stub(responses: Array<() => Response | Promise<Response>>) {
  const calls: string[] = [];
  const fetcher = (async (url: string | URL) => {
    calls.push(String(url));
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    return next();
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

beforeEach(() => resetUsdcRatesCache());

test('lists the display currencies in the owner order, USDC first', () => {
  assert.deepEqual([...DISPLAY_CURRENCIES], ['USDC', 'NGN', 'USD', 'EUR', 'GBP', 'CNY', 'INR', 'AED', 'KES', 'XOF']);
});

test('readsCoinGeckoFirst', async () => {
  const { fetcher, calls } = stub([() => coingecko()]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.equal(out.source, 'coingecko');
  assert.equal(out.rates.NGN, 1346.11);
  assert.equal(out.rates.USD, 0.999778);
  assert.equal(out.updatedAt, NOW);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /api\.coingecko\.com\/api\/v3\/simple\/price\?ids=usd-coin/);
});

test('fallsBackToOpenErApi', async () => {
  const { fetcher, calls } = stub([() => new Response('slow down', { status: 429 }), () => openEr()]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.equal(out.source, 'open-er-api');
  assert.equal(out.rates.XOF, 583.747262);
  assert.equal(out.rates.USD, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /open\.er-api\.com\/v6\/latest\/USD/);
});

test('cachesForSixtySeconds', async () => {
  const { fetcher, calls } = stub([() => coingecko(), () => coingecko()]);
  await readUsdcRates(NOW, fetcher);
  await readUsdcRates(NOW + 59_000, fetcher);
  assert.equal(calls.length, 1);
  await readUsdcRates(NOW + 61_000, fetcher);
  assert.equal(calls.length, 2);
});

test('a fresh-enough reading answers at once while one refresh runs behind it (8 Nov)', async () => {
  const first = stub([() => coingecko()]);
  await readUsdcRates(NOW, first.fetcher);
  let release: (r: Response) => void = () => {};
  const slow = stub([() => new Promise<Response>((r) => { release = r; })]);
  const started = Date.now();
  const [a, b] = await Promise.all([readUsdcRates(NOW + 90_000, slow.fetcher), readUsdcRates(NOW + 90_500, slow.fetcher)]);
  assert.ok(Date.now() - started < 200, 'nobody waits on the rate source');
  assert.equal(a.rates.NGN, 1346.11);
  assert.equal(b.rates.NGN, 1346.11);
  assert.equal(slow.calls.length, 1, 'one refresh for both');
  release(coingecko((NOW + 90_000) / 1000));
  await new Promise((r) => setTimeout(r, 10));
  const after = await readUsdcRates(NOW + 91_000, stub([]).fetcher);
  assert.equal(after.updatedAt, NOW + 90_000);
});

test('staleAfter15Minutes', async () => {
  const sixteenMinutesAgo = (NOW - 16 * 60_000) / 1000;
  const { fetcher } = stub([() => coingecko(sixteenMinutesAgo), () => new Response('', { status: 503 })]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.deepEqual(out.rates, {});
});

test('a daily fallback rate counts from when it was read, not from its publish time', async () => {
  const yesterday = (NOW - 20 * 3600_000) / 1000;
  const { fetcher } = stub([() => new Response('', { status: 500 }), () => openEr(yesterday)]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.equal(out.source, 'open-er-api');
  assert.equal(out.rates.NGN, 1346.474525);
});

test('bothSourcesDown', async () => {
  const { fetcher } = stub([() => { throw new Error('offline'); }, () => new Response('', { status: 503 })]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.deepEqual(out, { rates: {}, updatedAt: null, source: null });
});

test('a cached reading older than 15 minutes is not served when both sources fail', async () => {
  const first = stub([() => coingecko()]);
  await readUsdcRates(NOW, first.fetcher);
  const later = stub([() => { throw new Error('offline'); }, () => { throw new Error('offline'); }]);
  const out = await readUsdcRates(NOW + 16 * 60_000, later.fetcher);
  assert.deepEqual(out.rates, {});
});

test('balanceAddsLocalFigure', () => {
  const rates = { rates: { NGN: 1346.11, EUR: 0.889118 }, updatedAt: NOW, source: 'coingecko' as const };
  assert.deepEqual(localFigure(4021.29, 'NGN', rates), { currency: 'NGN', amount: '5413099', rate: 1346.11, updatedAt: NOW });
  assert.equal(localFigure(10, 'EUR', rates)?.amount, '8.89');
});

test('balanceOmitsLocalWhenStale', () => {
  assert.equal(localFigure(10, 'NGN', { rates: {}, updatedAt: null, source: null }), null);
  assert.equal(localFigure(10, 'USDC', { rates: { NGN: 1 }, updatedAt: NOW, source: 'coingecko' }), null);
  assert.equal(localFigure(10, undefined, { rates: { NGN: 1 }, updatedAt: NOW, source: 'coingecko' }), null);
});

test('rejects nonsense rates from a source', async () => {
  const bad = () => new Response(JSON.stringify({ 'usd-coin': { ngn: -4, eur: 'x', last_updated_at: NOW / 1000 } }), { status: 200 });
  const { fetcher } = stub([bad, () => openEr()]);
  const out = await readUsdcRates(NOW, fetcher);
  assert.equal(out.source, 'open-er-api');
});
