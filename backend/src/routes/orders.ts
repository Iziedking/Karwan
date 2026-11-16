import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  changedOrder, liveCount, MAX_ORDERS, newOrder, ORDER_BUDGET_MAX, ORDER_DAYS_MAX, ORDER_NEED_MAX, paused, PER_DAY_MAX, resumed, rolled, validateOrder,
  type OrderRefusal, type StandingOrder,
} from '../find/orders.js';
import { prohibitedReason } from '../policy/prohibited.js';
import { DISPLAY_CURRENCIES, type LocalCurrency } from '../rates/usdcRates.js';
import { invalidBodyMessage } from './invalidBody.js';

/// Standing orders (view 87, step 4): what a person told their agent to work
/// every day. Every route acts only for the signed-in person. Starting an
/// order is the consent for the agent to post that need privately and ask
/// people for it, inside the order's budget; nothing here moves money.

export interface OrderRouteDeps {
  sessionAddress: (c: Context) => string | null | Promise<string | null>;
  list: (owner: string, now: number) => Promise<StandingOrder[]>;
  get: (owner: string, id: string) => Promise<StandingOrder | null>;
  save: (order: StandingOrder) => Promise<StandingOrder>;
  remove: (owner: string, id: string) => Promise<boolean>;
  /// Whether the person's agent finds people right now. An order started
  /// while it does not is kept and waits.
  working: (owner: string) => Promise<boolean>;
  /// The hour and day it is where the person is.
  hourFor: (owner: string, now: number) => Promise<{ hour: number; day: string }>;
  /// Works the orders due now, without waiting for the next sweep.
  kick: () => void;
  now: () => number;
  newId: () => string;
}

const DAY_MS = 86_400_000;

const LOCAL = DISPLAY_CURRENCIES.filter((c): c is LocalCurrency => c !== 'USDC') as [LocalCurrency, ...LocalCurrency[]];
const said = z.object({ currency: z.enum(LOCAL), amount: z.number().positive().max(1e13) });
const until = { until: z.number().int().positive().nullable().optional(), untilDays: z.number().int().min(1).max(ORDER_DAYS_MAX).optional() };

export const orderBody = z.object({
  side: z.enum(['buy', 'sell']),
  need: z.string().trim().min(3).max(ORDER_NEED_MAX),
  budgetUsdc: z.number().positive().max(ORDER_BUDGET_MAX).nullable().optional(),
  said: said.optional(),
  kind: z.enum(['goods', 'in_person', 'remote']),
  where: z.object({ scope: z.enum(['near', 'country', 'anywhere']), country: z.string().regex(/^[A-Za-z]{2}$/).optional() }).optional(),
  perDay: z.number().int().min(1).max(PER_DAY_MAX).optional(),
  ...until,
});

export const orderChangeBody = z.union([
  z.object({ action: z.enum(['pause', 'resume', 'stop']) }),
  z
    .object({ budgetUsdc: z.number().positive().max(ORDER_BUDGET_MAX).optional(), said: said.optional(), perDay: z.number().int().min(1).max(PER_DAY_MAX).optional(), ...until })
    .refine((b) => b.budgetUsdc !== undefined || b.perDay !== undefined || b.until !== undefined || b.untilDays !== undefined, { message: 'nothing to change' }),
]);

const REFUSALS: Record<OrderRefusal, string> = {
  need: 'Say what it should find in a few words.',
  budget: 'Say the most to pay for one.',
  perDay: `It can ask 1 to ${PER_DAY_MAX} people a day.`,
  until: `The date must be ahead, within ${ORDER_DAYS_MAX} days.`,
  'too-many': `You can keep up to ${MAX_ORDERS} orders. Stop one first.`,
};

/// What the owner's screen reads. Today's count is today's where they are.
export type OrderView = Pick<StandingOrder, 'id' | 'side' | 'need' | 'budgetUsdc' | 'said' | 'kind' | 'perDay' | 'until' | 'state' | 'jobId' | 'findId' | 'createdAt'> & {
  askedToday: number;
  week: { asked: number; offers: number; locked: number };
  /// What it waits on the person for, if anything.
  waitsFor: 'location' | 'money' | null;
};

export function orderView(order: StandingOrder, now: number, day: string): OrderView {
  const o = rolled(order, now, day);
  return {
    id: o.id, side: o.side, need: o.need, budgetUsdc: o.budgetUsdc, ...(o.said ? { said: o.said } : {}), kind: o.kind, perDay: o.perDay, until: o.until, state: o.state,
    jobId: o.jobId, findId: o.findId, createdAt: o.createdAt, askedToday: o.today.asked, week: { asked: o.week.asked, offers: o.week.offers, locked: o.week.locked },
    waitsFor: o.told === 'location' ? 'location' : o.told === 'money' ? 'money' : null,
  };
}

const untilOf = (b: { until?: number | null; untilDays?: number }, now: number): number | null | undefined =>
  b.untilDays !== undefined ? now + b.untilDays * DAY_MS : b.until;

export function createOrderRoutes(deps: OrderRouteDeps) {
  const app = new Hono();

  app.get('/', async (c) => {
    const me = await deps.sessionAddress(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    const now = deps.now();
    const [orders, working, { day }] = await Promise.all([deps.list(me, now), deps.working(me), deps.hourFor(me, now)]);
    return c.json({ orders: orders.map((o) => orderView(o, now, day)), max: MAX_ORDERS, working });
  });

  app.post('/', async (c) => {
    const me = await deps.sessionAddress(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    let body: z.infer<typeof orderBody>;
    try {
      body = orderBody.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const prohibited = prohibitedReason(body.need);
    if (prohibited) return c.json({ error: prohibited.message, code: 'PROHIBITED_TRADE', category: prohibited.category }, 422);
    const now = deps.now();
    const mine = await deps.list(me, now);
    const valid = validateOrder({ ...body, until: untilOf(body, now) ?? null }, liveCount(mine), now);
    if (!valid.ok) return c.json({ error: REFUSALS[valid.code], code: valid.code }, valid.code === 'too-many' ? 409 : 400);
    const { hour, day } = await deps.hourFor(me, now);
    const order = await deps.save(newOrder(me, valid.order, deps.newId(), now, hour, day));
    const working = await deps.working(me);
    if (working) deps.kick();
    return c.json({ order: orderView(order, now, day), working });
  });

  app.post('/:id', async (c) => {
    const me = await deps.sessionAddress(c);
    if (!me) return c.json({ error: 'not authenticated' }, 401);
    let body: z.infer<typeof orderChangeBody>;
    try {
      body = orderChangeBody.parse(await c.req.json());
    } catch (err) {
      return c.json({ error: invalidBodyMessage(err) }, 400);
    }
    const id = c.req.param('id');
    const order = await deps.get(me, id);
    if (!order) return c.json({ error: 'order not found' }, 404);
    const now = deps.now();
    if ('action' in body) {
      // Stop removes it. Offers and alerts already out stay on their requests.
      if (body.action === 'stop') return (await deps.remove(me, id)) ? c.json({ ok: true, stopped: true }) : c.json({ error: 'order not found' }, 404);
      if (order.state !== 'on' && order.state !== 'paused') return c.json({ error: 'This order has finished.', code: 'finished' }, 409);
      const next = await deps.save(body.action === 'pause' ? paused(order) : resumed(order, now));
      if (body.action === 'resume') deps.kick();
      return c.json({ order: orderView(next, now, (await deps.hourFor(me, now)).day) });
    }
    if (order.state !== 'on' && order.state !== 'paused') return c.json({ error: 'This order has finished.', code: 'finished' }, 409);
    const changed = changedOrder(order, { budgetUsdc: body.budgetUsdc, said: body.said, perDay: body.perDay, until: untilOf(body, now) }, now);
    if (!changed.ok) return c.json({ error: REFUSALS[changed.code], code: changed.code }, 400);
    const next = await deps.save(changed.order);
    return c.json({ order: orderView(next, now, (await deps.hourFor(me, now)).day) });
  });

  return app;
}

/// Mounted at /api/agents/orders. The live wiring loads on first use, so the
/// route inventory and tests never open the database.
const store = () => import('../find/orders.js');
const live = () => import('../find/orderLive.js');
export const orderRoutes = createOrderRoutes({
  sessionAddress: async (c) => (await import('../auth/session.js')).sessionAddress(c),
  list: async (owner, now) => (await store()).ordersOf(owner, now),
  get: async (owner, id) => (await store()).orderOf(owner, id),
  save: async (order) => (await store()).saveOrder(order),
  remove: async (owner, id) => (await store()).removeOrder(owner, id),
  working: async (owner) => (await live()).findIsOnFor(owner),
  hourFor: async (owner, now) => (await live()).hourFor(owner, now),
  kick: () => void live().then((m) => m.sweepOrdersNow()),
  now: Date.now,
  newId: () => `so_${randomUUID().slice(0, 12)}`,
});
