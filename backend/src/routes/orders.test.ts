import assert from 'node:assert/strict';
import test from 'node:test';
import type { StandingOrder } from '../find/orders.js';
import { createOrderRoutes, type OrderRouteDeps, type OrderView } from './orders.js';

/// The standing order routes (view 87, step 4).
///
///   npx tsx --test src/routes/orders.test.ts

const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;

function harness(opts: { me?: string | null; working?: boolean } = {}) {
  const rows = new Map<string, StandingOrder>();
  let ids = 0;
  let kicks = 0;
  const state = { me: opts.me === undefined ? '0xada' : opts.me, working: opts.working ?? true };
  const deps: OrderRouteDeps = {
    sessionAddress: () => state.me,
    list: async (owner) => [...rows.values()].filter((o) => o.owner === owner),
    get: async (owner, id) => {
      const o = rows.get(id);
      return o && o.owner === owner ? o : null;
    },
    save: async (o) => (rows.set(o.id, o), o),
    remove: async (owner, id) => {
      const o = rows.get(id);
      return o && o.owner === owner ? rows.delete(id) : false;
    },
    working: async () => state.working,
    hourFor: async () => ({ hour: 13, day: '2026-11-16' }),
    kick: () => void (kicks += 1),
    now: () => NOW,
    newId: () => `so_${++ids}`,
  };
  const app = createOrderRoutes(deps);
  const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { app, post, rows, state, kicks: () => kicks };
}

const RICE = { side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 44.57, said: { currency: 'NGN', amount: 60_000 }, kind: 'goods', untilDays: 4 };

test('nobody signed in reads or changes orders', async () => {
  const h = harness({ me: null });
  assert.equal((await h.app.request('/')).status, 401);
  assert.equal((await h.post('/', RICE)).status, 401);
  assert.equal((await h.post('/so_1', { action: 'stop' })).status, 401);
});

test('starting an order saves it, due at once, and works it without waiting for the sweep', async () => {
  const h = harness();
  const res = await h.post('/', RICE);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { order: OrderView; working: boolean };
  assert.equal(body.working, true);
  assert.deepEqual(
    { ...body.order, createdAt: 0 },
    { id: 'so_1', side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: '44.57', said: { currency: 'NGN', amount: 60_000 }, kind: 'goods', perDay: 5, until: NOW + 4 * DAY, state: 'on', jobId: null, findId: null, createdAt: 0, askedToday: 0, week: { asked: 0, offers: 0, locked: 0 }, waitsFor: null },
  );
  const saved = h.rows.get('so_1')!;
  assert.equal(saved.owner, '0xada');
  assert.equal(saved.nextAt, NOW);
  assert.equal(saved.runAtHour, 13);
  assert.equal(h.kicks(), 1);
});

test('an order started while the agent is not finding people is kept and waits', async () => {
  const h = harness({ working: false });
  const body = (await (await h.post('/', RICE)).json()) as { working: boolean };
  assert.equal(body.working, false);
  assert.equal(h.rows.size, 1);
  assert.equal(h.kicks(), 0);
});

test('a bad order is refused with its reason, a sixth with 409, a forbidden trade with 422', async () => {
  const h = harness();
  assert.equal((await h.post('/', { ...RICE, need: 'x' })).status, 400);
  const noBudget = await h.post('/', { side: 'buy', need: 'A bag of rice', kind: 'goods' });
  assert.equal(noBudget.status, 400);
  assert.equal(((await noBudget.json()) as { code: string }).code, 'budget');
  assert.equal((await h.post('/', { ...RICE, perDay: 6 })).status, 400);
  assert.equal((await h.post('/', { ...RICE, need: 'Buy 5000 followers for my page' })).status, 422);
  for (let i = 0; i < 5; i++) assert.equal((await h.post('/', RICE)).status, 200);
  const sixth = await h.post('/', RICE);
  assert.equal(sixth.status, 409);
  assert.equal(((await sixth.json()) as { code: string }).code, 'too-many');
});

test('the list is the owner\'s alone, with today\'s count as of their own day', async () => {
  const h = harness();
  await h.post('/', RICE);
  const mine = h.rows.get('so_1')!;
  h.rows.set('so_1', { ...mine, today: { day: '2026-11-15', asked: 3 }, week: { ...mine.week, asked: 3, offers: 1 }, told: 'money' });
  h.rows.set('theirs', { ...mine, id: 'theirs', owner: '0xother' });
  const body = (await (await h.app.request('/')).json()) as { orders: OrderView[]; max: number; working: boolean };
  assert.equal(body.max, 5);
  assert.deepEqual(body.orders.map((o) => o.id), ['so_1']);
  assert.equal(body.orders[0]!.askedToday, 0, 'yesterday\'s count is not today\'s');
  assert.deepEqual(body.orders[0]!.week, { asked: 3, offers: 1, locked: 0 });
  assert.equal(body.orders[0]!.waitsFor, 'money');
  assert.equal((await h.post('/theirs', { action: 'stop' })).status, 404);
});

test('pause keeps it, resume runs it at once, stop removes it', async () => {
  const h = harness();
  await h.post('/', RICE);
  const paused = (await (await h.post('/so_1', { action: 'pause' })).json()) as { order: OrderView };
  assert.equal(paused.order.state, 'paused');
  assert.equal(h.kicks(), 1);
  const resumed = (await (await h.post('/so_1', { action: 'resume' })).json()) as { order: OrderView };
  assert.equal(resumed.order.state, 'on');
  assert.equal(h.kicks(), 2);
  const stopped = await h.post('/so_1', { action: 'stop' });
  assert.deepEqual(await stopped.json(), { ok: true, stopped: true });
  assert.equal(h.rows.size, 0);
  assert.equal((await h.post('/so_1', { action: 'pause' })).status, 404);
});

test('a change takes a new budget, date or people a day; a finished order takes none', async () => {
  const h = harness();
  await h.post('/', RICE);
  const changed = (await (await h.post('/so_1', { budgetUsdc: 30, perDay: 2, until: null })).json()) as { order: OrderView };
  assert.equal(changed.order.budgetUsdc, '30');
  assert.equal(changed.order.said, undefined);
  assert.equal(changed.order.perDay, 2);
  assert.equal(changed.order.until, null);
  assert.equal((await h.post('/so_1', {})).status, 400);
  assert.equal((await h.post('/so_1', { until: NOW - 1 })).status, 400);
  h.rows.set('so_1', { ...h.rows.get('so_1')!, state: 'done', endedAt: NOW });
  assert.equal((await h.post('/so_1', { perDay: 3 })).status, 409);
  assert.equal((await h.post('/so_1', { action: 'resume' })).status, 409);
  assert.equal((await h.post('/so_1', { action: 'stop' })).status, 200);
});
