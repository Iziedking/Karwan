import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProfilePatch } from '../agents/agentBrief.js';
import { createSetupRoutes, type SetupRouteDeps } from './setup.js';

/// Setup answers are read on the server: preview saves nothing, save stores
/// what the server read, never what the browser sent as a result.
///
///   npx tsx --test src/routes/setup.test.ts

function harness(over: Partial<SetupRouteDeps> = {}) {
  const saved: ProfilePatch[] = [];
  const places: unknown[] = [];
  let now = 1_000;
  const deps: SetupRouteDeps = {
    sessionAddress: () => '0xada',
    current: async () => ({ address: '0xada', role: 'buyer', displayName: 'Ada', createdAt: 0, updatedAt: 0 }),
    read: async () => ({ patch: { goals: ['work'], agentPrefs: {}, settings: {} }, lines: ['Your agent offers Logo design'], needs: [], place: { country: 'NG', city: 'Lagos' } }),
    save: async (_a, patch) => { saved.push(patch); return { address: '0xada', role: 'seller', displayName: 'Ada', createdAt: 0, updatedAt: 0 }; },
    saveLocation: async (_a, place) => { places.push(place); },
    locale: async () => 'en',
    now: () => now,
    ...over,
  };
  const app = createSetupRoutes(deps);
  const post = (path: string, body: unknown) => app.request(path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return { app, post, saved, places, tick: (ms: number) => { now += ms; } };
}

const answers = { goals: ['work'], what: 'Logo design', price: '20 to 40' };

test('learned suggestions are read, and a no is remembered on the prefs (view 41)', async () => {
  const suggestion = { key: 'way:goods', kind: 'new-way' as const, shape: 'goods' as const, what: 'Shoes', priceUsdc: 96, line: 'Save this as how you sell Shoes?' };
  const h = harness({ learned: async () => [suggestion] });
  assert.equal((await h.app.request('/suggestions')).status, 200);
  assert.deepEqual(await (await h.app.request('/suggestions')).json(), { suggestions: [suggestion] });
  const res = await h.post('/dismiss-suggestion', { key: 'way:goods' });
  assert.equal(res.status, 200);
  assert.deepEqual(h.saved[0]!.agentPrefs?.dismissedSuggestions, ['way:goods']);
  assert.equal((await h.post('/dismiss-suggestion', { key: '' })).status, 400);
});

test('a way saved with a no-ask level keeps it', async () => {
  const h = harness();
  const banded = { sell: [{ shape: 'one_time', priceMin: 20, priceUsual: 30, noAskBelow: 12, daysMin: 1, daysMax: 3 }], buy: [] };
  const res = await h.post('/ways', { ways: banded });
  assert.equal(res.status, 200);
  assert.deepEqual(h.saved[0]!.agentWays, banded);
  assert.equal((await h.post('/ways', { ways: { sell: [{ ...banded.sell[0], noAskBelow: 25 }], buy: [] } })).status, 400);
});

test('no session, no setup', async () => {
  const h = harness({ sessionAddress: () => null });
  assert.equal((await h.post('/preview', { answers })).status, 401);
  assert.equal((await h.post('/save', { answers })).status, 401);
});

test('preview reads and saves nothing', async () => {
  const h = harness();
  const res = await h.post('/preview', { answers });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { lines: ['Your agent offers Logo design'], needs: [] });
  assert.equal(h.saved.length, 0);
});

test("save stores the server's reading, marks setup done and saves the place", async () => {
  const h = harness();
  const res = await h.post('/save', { answers, lines: ['forged'], patch: { role: 'both' } });
  assert.equal(res.status, 200);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0]!.role, undefined);
  assert.equal(h.saved[0]!.settings?.setupDoneAt, 1_000);
  assert.deepEqual(h.places, [{ country: 'NG', city: 'Lagos' }]);
});

test('save returns the first post to offer', async () => {
  const h = harness();
  const seller = await (await h.post('/save', { answers })).json();
  assert.equal(seller.firstPost.kind, 'offer');
  const record = await (await h.post('/save', { answers: { goals: ['record'] } })).json();
  assert.equal(record.firstPost, null);
});

test('an answer the server could not read is not saved yet', async () => {
  const h = harness({ read: async () => ({ patch: { goals: ['work'], agentPrefs: {}, settings: {} }, lines: [], needs: ['price'], place: null }) });
  const res = await h.post('/save', { answers });
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'answer needed', needs: ['price'] });
  assert.equal(h.saved.length, 0);
});

test('bad answers are refused', async () => {
  const h = harness();
  assert.equal((await h.post('/preview', { answers: { goals: ['dance'] } })).status, 400);
});

test('one account gets 20 readings in ten minutes', async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) assert.equal((await h.post('/preview', { answers })).status, 200);
  assert.equal((await h.post('/preview', { answers })).status, 429);
  h.tick(10 * 60 * 1000 + 1);
  assert.equal((await h.post('/preview', { answers })).status, 200);
});

const ways = {
  sell: [{ shape: 'goods', what: 'Wigs', priceMin: 80, priceUsual: 190, shipsTo: 'Nigeria', arriveDaysMin: 2, arriveDaysMax: 5 }],
  buy: [{ shape: 'one_time', maxPrice: 200, needDays: 7 }],
};

test('ways are saved with the older settings in step', async () => {
  const h = harness();
  const res = await h.post('/ways', { ways });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { lines: string[] };
  assert.equal(body.lines.length, 2);
  const patch = h.saved[0]!;
  assert.deepEqual(patch.agentWays, ways);
  assert.equal(patch.role, 'both');
  assert.equal(patch.seller?.tradeType, 'goods');
  assert.equal(patch.seller?.maxBudgetUsdc, 190);
  assert.equal(patch.buyer?.maxBudgetUsdc, 200);
  assert.equal(patch.agentPrefs?.sellerPriceSet, true);
});

test('ways outside the live shapes, or without a session, are refused', async () => {
  assert.equal((await harness({ sessionAddress: () => null }).post('/ways', { ways })).status, 401);
  const h = harness();
  assert.equal((await h.post('/ways', { ways: { sell: [{ shape: 'retainer', monthly: 100 }], buy: [] } })).status, 400);
  assert.equal(h.saved.length, 0);
});

test('what the agent does alone changes on its own, keeping the other prefs (view 45)', async () => {
  const h = harness({ current: async () => ({ address: '0xada', role: 'seller', displayName: 'Ada', createdAt: 0, updatedAt: 0, agentPrefs: { findClients: false, agentMode: 'offers' } }) });
  const res = await h.post('/agent-mode', { agentMode: 'ask' });
  assert.equal(res.status, 200);
  assert.deepEqual(h.saved[0]!.agentPrefs, { findClients: false, agentMode: 'ask' });
  assert.equal((await h.post('/agent-mode', { agentMode: 'everything' })).status, 400);
  const signedOut = harness({ sessionAddress: () => null });
  assert.equal((await signedOut.post('/agent-mode', { agentMode: 'ask' })).status, 401);
});

test('a carried-over usual price stays marked when only the way of getting paid is saved (view 41, decision 14)', async () => {
  const h = harness();
  const carried = { sell: [{ shape: 'milestones', priceMin: 10, priceUsual: 10005, usualGuessed: true, daysMin: 2, daysMax: 9, stages: 2 }], buy: [] };
  assert.equal((await h.post('/ways', { ways: carried })).status, 200);
  assert.equal((h.saved[0]!.agentWays!.sell[0] as { usualGuessed?: boolean }).usualGuessed, true);
  assert.equal(h.saved[0]!.seller?.usualSet, false);
});

/// Set up in two minutes (view 39, 19 Nov): sell, buy or both, one line each,
/// then where you are and how we reach you.
function reading() {
  const seen: unknown[] = [];
  const h = harness({
    read: async (a) => { seen.push(a); return { patch: { goals: a.goals, agentPrefs: {}, settings: { notifyVia: a.reach } }, lines: [], needs: [], place: null }; },
  });
  return { ...h, seen };
}

test('one sell line is read as what is sold and its price', async () => {
  const h = reading();
  const res = await h.post('/save', { answers: { role: 'sell', sellLine: 'Logo and brand design, ₦30,000 to ₦60,000, 3 days', reach: 'both' } });
  assert.equal(res.status, 200);
  assert.deepEqual(h.seen[0], { goals: ['work'], what: 'Logo and brand design', price: '₦30,000 to ₦60,000, 3 days', paid: 'one_time', reach: 'both' });
  assert.equal((await res.json()).firstPost.kind, 'offer');
});

test('buy and both set the goals the agent works from', async () => {
  const h = reading();
  await h.post('/save', { answers: { role: 'buy', buyLine: 'A designer, up to ₦50,000' } });
  await h.post('/save', { answers: { role: 'both', sellLine: 'Phone repairs, about ₦15,000', buyLine: 'Screens from a supplier' } });
  assert.deepEqual(h.seen[0], { goals: ['buy'], buy: 'A designer, up to ₦50,000' });
  assert.deepEqual(h.seen[1], { goals: ['work', 'buy'], what: 'Phone repairs', price: 'about ₦15,000', paid: 'one_time', buy: 'Screens from a supplier' });
});

test('the place picked is saved, with the phone position kept to about a kilometre', async () => {
  const h = reading();
  const place = { country: 'ng', city: 'Lagos', admin: 'Lagos', point: { lat: 6.52449, lng: 3.37921 } };
  assert.equal((await h.post('/save', { answers: { role: 'sell', sellLine: 'Logo design, ₦20,000', place } })).status, 200);
  assert.deepEqual(h.places, [{ country: 'NG', city: 'Lagos', point: { lat: 6.52, lng: 3.38 } }]);
  await h.post('/save', { answers: { role: 'sell', sellLine: 'Logo design, ₦20,000', place: { country: 'GH', city: 'Accra' } } });
  assert.deepEqual(h.places[1], { country: 'GH', city: 'Accra' });
});

test('a place that is not a country, or a position off the map, is refused', async () => {
  const h = reading();
  assert.equal((await h.post('/save', { answers: { role: 'sell', sellLine: 'x', place: { country: 'Nigeria' } } })).status, 400);
  assert.equal((await h.post('/save', { answers: { role: 'sell', sellLine: 'x', place: { country: 'NG', point: { lat: 120, lng: 3 } } } })).status, 400);
});

test('how long setup took is kept, capped at an hour', async () => {
  const h = reading();
  h.tick(200_000);
  await h.post('/save', { answers: { role: 'buy', buyLine: 'Rice', startedAt: 105_000 } });
  assert.equal(h.saved[0]!.settings?.setupSeconds, 96);
  await h.post('/save', { answers: { role: 'buy', buyLine: 'Rice', startedAt: -9_000_000 } });
  assert.equal(h.saved[1]!.settings?.setupSeconds, 3600);
  await h.post('/save', { answers: { role: 'buy', buyLine: 'Rice' } });
  assert.equal(h.saved[2]!.settings?.setupSeconds, undefined);
});

test('nearby asks for what you sell, in your city (view 39, 19 Nov)', async () => {
  const calls: unknown[] = [];
  const h = harness({ nearby: async (...args) => { calls.push(args); return { count: 8, rows: [{ what: 'Logo for a food brand', budgetUsdc: 32 }] }; } });
  const res = await h.app.request('/nearby?role=sell&line=Logo%20design&country=ng&city=Lagos');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { count: 8, rows: [{ what: 'Logo for a food brand', budgetUsdc: 32 }] });
  assert.deepEqual(calls[0], ['0xada', 'sell', 'Logo design', 'NG', 'Lagos']);
});

test('nearby asks need a session, a role, a line and a country, and come 20 a minute', async () => {
  const h = harness({ nearby: async () => ({ count: 0, rows: [] }) });
  assert.equal((await harness({ sessionAddress: () => null, nearby: async () => ({ count: 0, rows: [] }) }).app.request('/nearby?role=sell&line=x&country=NG')).status, 401);
  assert.equal((await h.app.request('/nearby?role=dance&line=x&country=NG')).status, 400);
  assert.equal((await h.app.request('/nearby?role=sell&country=NG')).status, 400);
  assert.equal((await h.app.request('/nearby?role=sell&line=x&country=Nigeria')).status, 400);
  for (let i = 0; i < 20; i++) assert.equal((await h.app.request('/nearby?role=buy&line=rice&country=NG&city=Kano')).status, 200);
  assert.equal((await h.app.request('/nearby?role=buy&line=rice&country=NG&city=Kano')).status, 429);
});

test('when nearby asks cannot be read, the card is simply empty', async () => {
  const h = harness({ nearby: async () => { throw new Error('market down'); } });
  assert.deepEqual(await (await h.app.request('/nearby?role=sell&line=Logo&country=NG&city=Lagos')).json(), { count: 0, rows: [] });
});

test('the preview gives the figures it read, for the chips and the market card', async () => {
  const read = { price: { min: 20, max: 40 }, pace: { minDays: 3, maxDays: 3 }, buyMax: null, business: null, place: null };
  const h = harness({ read: async (a) => ({ patch: { goals: a.goals, agentPrefs: {}, settings: {} }, lines: ['x'], needs: [], place: null, read }) });
  const res = await h.post('/preview', { answers: { role: 'sell', sellLine: 'Logo design, 20 to 40 USDC, 3 days' } });
  assert.deepEqual(await res.json(), {
    lines: ['x'], needs: [],
    card: { what: 'Logo design', buy: null, priceMin: 20, priceMax: 40, daysMin: 3, daysMax: 3, buyMax: null },
  });
});
