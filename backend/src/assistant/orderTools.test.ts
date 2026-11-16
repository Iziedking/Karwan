import assert from 'node:assert/strict';
import test from 'node:test';
import { newOrder, validateOrder, type StandingOrder } from '../find/orders.js';
import type { AssistantAction } from './actions.js';
import { orderTools, type OrderToolDeps } from './orderTools.js';
import { PLATFORM_GUIDE } from './platformGuide.js';

/// Standing orders from the assistant (view 87, step 4).
///
///   npx tsx --test src/assistant/orderTools.test.ts

const ME = '0xAda0000000000000000000000000000000000000';
const NOW = Date.UTC(2026, 10, 16, 12);
const call = { toolCallId: 't', messages: [] as never[] };

function order(id: string, over: Partial<StandingOrder> = {}): StandingOrder {
  const v = validateOrder({ side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 44.57, kind: 'goods' }, 0, NOW);
  assert.ok(v.ok);
  return { ...newOrder(ME, v.order, id, NOW, 13, '2026-11-16'), ...over };
}

function setup(over: Partial<OrderToolDeps> = {}) {
  const actions: AssistantAction[] = [];
  const deps: OrderToolDeps = {
    orders: async () => [],
    working: async () => true,
    money: async (_a, usdc) => `₦${Math.round(usdc * 1346).toLocaleString('en')}`,
    now: () => NOW,
    ...over,
  };
  return { actions, tools: orderTools(ME, actions, deps) };
}

const card = (actions: AssistantAction[]) => actions[0] as unknown as { intent: string; title: string; summary: string; confirmLabel: string; fields: { label: string; value: string }[]; payload: Record<string, unknown> };

test('a buying order is a card with what, the most for one, until and people a day, and it says no money moves', async () => {
  const s = setup();
  const out = await s.tools.propose_standing_order.execute!({ side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 44.57, saidCurrency: 'NGN', saidAmount: 60_000, kind: 'goods', untilDays: 4 }, call);
  assert.deepEqual(out, { ok: true, shown: 'Start a standing order' });
  const c = card(s.actions);
  assert.equal(c.intent, 'start_standing_order');
  assert.match(c.summary, /moves no money/);
  assert.deepEqual(c.fields, [
    { label: 'What it should find', value: 'A 50kg bag of rice' },
    { label: 'The most for one', value: '60,000 NGN' },
    { label: 'Until', value: 'Fri 20 Nov' },
    { label: 'People a day', value: 'Up to 5' },
  ]);
  assert.deepEqual(c.payload, { side: 'buy', need: 'A 50kg bag of rice', budgetUsdc: 44.57, said: { currency: 'NGN', amount: 60_000 }, kind: 'goods', perDay: 5, untilDays: 4 });
  assert.equal(c.confirmLabel, 'Start the order');
});

test('a budget said in USDC is shown as the person reads it, and no date means until they stop it', async () => {
  const s = setup();
  await s.tools.propose_standing_order.execute!({ side: 'buy', need: 'A tailor for a dress', budgetUsdc: 50, kind: 'in_person', peopleADay: 2 }, call);
  const c = card(s.actions);
  assert.deepEqual(c.fields.map((f) => f.value), ['A tailor for a dress', '₦67,300', 'You stop it', 'Up to 2']);
  assert.equal(c.payload.untilDays, undefined);
});

test('a selling order has no budget on the card or in what is sent', async () => {
  const s = setup();
  await s.tools.propose_standing_order.execute!({ side: 'sell', need: 'Buyers for my catering', budgetUsdc: 99, kind: 'in_person' }, call);
  const c = card(s.actions);
  assert.deepEqual(c.fields.map((f) => f.label), ['What it should sell', 'Until', 'People a day']);
  assert.equal(c.payload.budgetUsdc, null);
  assert.match(c.summary, /usual price/);
});

test('an order started while the agent finds nobody says it waits', async () => {
  const s = setup({ working: async () => false });
  await s.tools.propose_standing_order.execute!({ side: 'buy', need: 'A bag of rice', budgetUsdc: 40, kind: 'goods' }, call);
  assert.match(card(s.actions).summary, /waits until it is/);
});

test('no budget when buying, a sixth order and a forbidden trade are refused in words, with no card', async () => {
  const s = setup();
  const noBudget = (await s.tools.propose_standing_order.execute!({ side: 'buy', need: 'A bag of rice', kind: 'goods' }, call)) as { error: string };
  assert.match(noBudget.error, /most they would pay/);
  const full = setup({ orders: async () => [1, 2, 3, 4, 5].map((n) => order(`o${n}`)) });
  const sixth = (await full.tools.propose_standing_order.execute!({ side: 'buy', need: 'A bag of rice', budgetUsdc: 40, kind: 'goods' }, call)) as { error: string };
  assert.match(sixth.error, /already keep 5 orders/);
  const bad = (await s.tools.propose_standing_order.execute!({ side: 'buy', need: 'Buy 5000 followers for my page', budgetUsdc: 40, kind: 'remote' }, call)) as { error: string };
  assert.ok(bad.error.length > 0);
  assert.equal(s.actions.length + full.actions.length, 0);
});

test('orders are read back with ids, money as the person reads it, and what each waits for', async () => {
  const s = setup({
    orders: async () => [order('o1', { week: { asked: 6, offers: 2, locked: 0, since: NOW }, until: NOW + 4 * 86_400_000 }), order('o2', { state: 'paused', told: 'location' })],
    working: async () => false,
  });
  const out = (await s.tools.my_standing_orders.execute!({}, call)) as { working: boolean; max: number; next?: string; orders: Array<Record<string, unknown>> };
  assert.equal(out.max, 5);
  assert.equal(out.working, false);
  assert.match(out.next ?? '', /not finding people right now/);
  assert.deepEqual(out.orders[0], {
    id: 'o1', side: 'buying', what: 'A 50kg bag of rice', mostForOne: '₦59,991', until: 'Fri 20 Nov', peopleADay: 5, state: 'running', askedThisWeek: 6, offersThisWeek: 2, waitsFor: null,
  });
  assert.equal(out.orders[1]!.state, 'paused');
  assert.equal(out.orders[1]!.until, 'until they stop it');
  assert.match(String(out.orders[1]!.waitsFor), /location/);
});

test('pause, resume and stop are cards for a real order in a state that allows them', async () => {
  const s = setup({ orders: async () => [order('o1'), order('o2', { state: 'paused' }), order('o3', { state: 'done' })] });
  const run = (id: string, action: 'pause' | 'resume' | 'stop') => s.tools.propose_stop_standing_order.execute!({ id, action }, call);
  assert.match(((await run('nope', 'stop')) as { error: string }).error, /not on their list/);
  assert.match(((await run('o1', 'resume')) as { error: string }).error, /already running/);
  assert.match(((await run('o2', 'pause')) as { error: string }).error, /already paused/);
  assert.match(((await run('o3', 'pause')) as { error: string }).error, /has finished/);
  assert.equal(s.actions.length, 0);
  await run('o1', 'pause');
  await run('o2', 'resume');
  await run('o3', 'stop');
  const cards = s.actions as unknown as Array<{ intent: string; title: string; payload: Record<string, unknown> }>;
  assert.deepEqual(cards.map((c) => [c.intent, c.title, c.payload]), [
    ['change_standing_order', 'Pause this order', { id: 'o1', action: 'pause' }],
    ['change_standing_order', 'Resume this order', { id: 'o2', action: 'resume' }],
    ['change_standing_order', 'Stop this order', { id: 'o3', action: 'stop' }],
  ]);
});

test('the guide names the three order tools and their routes', () => {
  const entry = PLATFORM_GUIDE.find((g) => g.id === 'standing-orders');
  assert.ok(entry);
  assert.deepEqual(entry.tools, ['my_standing_orders', 'propose_standing_order', 'propose_stop_standing_order']);
  assert.deepEqual(entry.api, ['GET /api/agents/orders', 'POST /api/agents/orders', 'POST /api/agents/orders/:id']);
  assert.ok(!/[—–]/.test(entry.summary));
});
