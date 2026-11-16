import type { QuietHours } from '../agents/mandate.js';
import { pgEnabled, postgresExecutor } from '../db/client.js';
import type { DeliveryKind, Where } from '../location/rules.js';
import type { LocalCurrency } from '../rates/usdcRates.js';
import { localAt, outOfQuiet } from './reminders.js';

/// Standing orders (view 87, step 4): something a person told their agent to
/// work every day until a date, a locked deal, or they stop it. A row with the
/// time of its next run; a sweep claims due rows with one conditional write,
/// so a restart or a second server neither skips a day nor runs one twice.
/// An order decides no price and moves no money.

export type OrderSide = 'buy' | 'sell';
export type OrderState = 'on' | 'paused' | 'done' | 'ended';

export interface StandingOrder {
  id: string;
  owner: string;
  side: OrderSide;
  need: string;
  /// The most for one, in USDC. A selling order has none: it uses the seller's own prices.
  budgetUsdc: string | null;
  /// The figure as the person typed it, in their own currency.
  said?: { currency: LocalCurrency; amount: number };
  kind: DeliveryKind;
  where: Where;
  perDay: number;
  until: number | null;
  state: OrderState;
  /// The find it is working and the private request posted from it.
  findId: string | null;
  jobId: string | null;
  runAtHour: number;
  nextAt: number;
  /// Runs in a row that found nobody new.
  emptyRuns: number;
  /// Who offered on the request it has open, so an offer is counted once.
  offerers?: string[];
  /// What a run could not go on without, said to the person once.
  told?: 'location' | 'money';
  today: { day: string; asked: number };
  week: { asked: number; offers: number; locked: number; since: number };
  createdAt: number;
  endedAt: number | null;
}

export const MAX_ORDERS = 5;
export const ORDER_NEED_MAX = 200;
export const PER_DAY_MAX = 5;
export const ORDER_DAYS_MAX = 90;
/// The most a request may be posted for.
export const ORDER_BUDGET_MAX = 5_000_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/// A finished order stays on the list this long.
const KEPT_MS = 7 * DAY_MS;

export interface OrderInput {
  side: OrderSide;
  need: string;
  budgetUsdc?: number | null;
  said?: { currency: LocalCurrency; amount: number };
  kind: DeliveryKind;
  where?: Where;
  perDay?: number;
  until?: number | null;
}

export type OrderRefusal = 'need' | 'budget' | 'perDay' | 'until' | 'too-many';
export type OrderDraft = Pick<StandingOrder, 'side' | 'need' | 'budgetUsdc' | 'said' | 'kind' | 'where' | 'perDay' | 'until'>;

const cents = (usdc: number) => Math.round(usdc * 100) / 100;

function budgetOf(side: OrderSide, usdc: number | null | undefined): string | null | 'bad' {
  if (side === 'sell') return null;
  if (typeof usdc !== 'number' || !Number.isFinite(usdc)) return 'bad';
  const b = cents(usdc);
  return b >= 0.01 && b <= ORDER_BUDGET_MAX ? String(b) : 'bad';
}

const perDayOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= PER_DAY_MAX;
const untilOk = (until: number | null, now: number) => until === null || (Number.isFinite(until) && until > now && until <= now + ORDER_DAYS_MAX * DAY_MS);

/// `live` is how many orders the person already has running or paused.
export function validateOrder(input: OrderInput, live: number, now: number): { ok: true; order: OrderDraft } | { ok: false; code: OrderRefusal } {
  if (live >= MAX_ORDERS) return { ok: false, code: 'too-many' };
  const need = input.need.trim();
  if (need.length < 3 || need.length > ORDER_NEED_MAX) return { ok: false, code: 'need' };
  const budgetUsdc = budgetOf(input.side, input.budgetUsdc);
  if (budgetUsdc === 'bad') return { ok: false, code: 'budget' };
  const perDay = input.perDay ?? PER_DAY_MAX;
  if (!perDayOk(perDay)) return { ok: false, code: 'perDay' };
  const until = input.until ?? null;
  if (!untilOk(until, now)) return { ok: false, code: 'until' };
  return {
    ok: true,
    order: {
      side: input.side, need, budgetUsdc, kind: input.kind, where: input.where ?? { scope: 'near' }, perDay, until,
      ...(input.said && budgetUsdc !== null ? { said: input.said } : {}),
    },
  };
}

/// A new order runs at once, then each day at the hour it was started.
export function newOrder(owner: string, draft: OrderDraft, id: string, now: number, runAtHour: number, day: string): StandingOrder {
  return {
    id, owner: owner.toLowerCase(), ...draft, state: 'on', findId: null, jobId: null, runAtHour, nextAt: now, emptyRuns: 0,
    today: { day, asked: 0 }, week: { asked: 0, offers: 0, locked: 0, since: now }, createdAt: now, endedAt: null,
  };
}

export interface OrderChange {
  budgetUsdc?: number;
  said?: { currency: LocalCurrency; amount: number };
  until?: number | null;
  perDay?: number;
}

/// The order after its person changed it. The request already open keeps the
/// figure it was posted with; the next find uses the new one.
export function changedOrder(o: StandingOrder, c: OrderChange, now: number): { ok: true; order: StandingOrder } | { ok: false; code: OrderRefusal } {
  let next = o;
  if (c.budgetUsdc !== undefined) {
    const b = budgetOf(o.side, c.budgetUsdc);
    if (b === 'bad' || b === null) return { ok: false, code: 'budget' };
    const { said: _said, ...rest } = next;
    next = { ...rest, budgetUsdc: b, ...(c.said ? { said: c.said } : {}) };
  }
  if (c.perDay !== undefined) {
    if (!perDayOk(c.perDay)) return { ok: false, code: 'perDay' };
    next = { ...next, perDay: c.perDay };
  }
  if (c.until !== undefined) {
    if (!untilOk(c.until, now)) return { ok: false, code: 'until' };
    next = { ...next, until: c.until };
  }
  return { ok: true, order: next };
}

/// The counts as of now: today's start over on a new day, the week's after seven days.
export function rolled(o: StandingOrder, now: number, day: string): StandingOrder {
  const today = o.today.day === day ? o.today : { day, asked: 0 };
  const week = now - o.week.since >= WEEK_MS ? { asked: 0, offers: 0, locked: 0, since: now } : o.week;
  return today === o.today && week === o.week ? o : { ...o, today, week };
}

/// Tomorrow at the order's hour in the person's own time, never in their quiet hours.
export function nextRunAt(o: Pick<StandingOrder, 'runAtHour'>, now: number, timeZone: string, quiet: QuietHours | null): number {
  return outOfQuiet(localAt(now, 1, o.runAtHour, timeZone), timeZone, quiet);
}

/// Paused keeps the order and stops its runs; resumed, it runs at once.
export function paused(o: StandingOrder): StandingOrder {
  return o.state === 'on' ? { ...o, state: 'paused' } : o;
}
export function resumed(o: StandingOrder, now: number): StandingOrder {
  return o.state === 'paused' ? { ...o, state: 'on', nextAt: now } : o;
}

/// What happened on the order's request, as it happens. `who` is the seller
/// behind an offer: the same seller offering again, or the same event read by
/// a second server, is not counted twice.
export function afterRequestEvent(o: StandingOrder, what: 'offer' | 'locked' | 'closed', now: number, who?: string): StandingOrder {
  if (what === 'offer') {
    const seller = who?.toLowerCase();
    if (!seller || o.offerers?.includes(seller)) return o;
    return { ...o, offerers: [...(o.offerers ?? []), seller], week: { ...o.week, offers: o.week.offers + 1 } };
  }
  if (o.state === 'done' || o.state === 'ended') return o;
  if (what === 'locked') return { ...o, state: 'done', endedAt: now, week: { ...o.week, locked: o.week.locked + 1 } };
  // The request ended with no deal: the next run starts a fresh find.
  const { offerers: _offerers, ...rest } = o;
  return { ...rest, findId: null, jobId: null };
}

const live = (o: StandingOrder) => o.state === 'on' || o.state === 'paused';
const mem = new Map<string, StandingOrder>();
const rowOf = (r: { data: unknown }) => r.data as StandingOrder;

/// A person's orders, oldest first: those running or paused, and those that
/// finished in the last week.
export async function ordersOf(owner: string, now = Date.now()): Promise<StandingOrder[]> {
  const o = owner.toLowerCase();
  const all = !pgEnabled
    ? [...mem.values()].filter((x) => x.owner === o)
    : (await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM standing_orders_v1 WHERE owner = $1`, [o])).rows.map(rowOf);
  return all.filter((x) => live(x) || now - (x.endedAt ?? 0) < KEPT_MS).sort((a, b) => a.createdAt - b.createdAt);
}

export const liveCount = (orders: readonly StandingOrder[]) => orders.filter(live).length;

/// One order, only for its owner.
export async function orderOf(owner: string, id: string): Promise<StandingOrder | null> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const x = mem.get(id);
    return x && x.owner === o ? x : null;
  }
  const r = await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM standing_orders_v1 WHERE id = $1 AND owner = $2`, [id, o]);
  return r.rows[0] ? rowOf(r.rows[0]) : null;
}

/// The order a private request was posted for, if any.
export async function orderByJob(jobId: string): Promise<StandingOrder | null> {
  const j = jobId.toLowerCase();
  if (!pgEnabled) return [...mem.values()].find((x) => x.jobId?.toLowerCase() === j) ?? null;
  const r = await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM standing_orders_v1 WHERE lower(data->>'jobId') = $1 LIMIT 1`, [j]);
  return r.rows[0] ? rowOf(r.rows[0]) : null;
}

export async function saveOrder(order: StandingOrder): Promise<StandingOrder> {
  const o: StandingOrder = { ...order, owner: order.owner.toLowerCase() };
  if (!pgEnabled) {
    mem.set(o.id, o);
    return o;
  }
  await postgresExecutor().query(
    `INSERT INTO standing_orders_v1 (id, owner, state, next_at, data) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, next_at = EXCLUDED.next_at, data = EXCLUDED.data`,
    [o.id, o.owner, o.state, o.nextAt, o],
  );
  return o;
}

/// What a run wrote back. The time of the next run was set when the run was
/// claimed, and a pause or stop made meanwhile wins over the run.
export async function saveRun(order: StandingOrder): Promise<StandingOrder | null> {
  if (!pgEnabled) {
    const cur = mem.get(order.id);
    if (!cur) return null;
    const next = cur.state === 'paused' && order.state === 'on' ? { ...order, state: 'paused' as const } : order;
    mem.set(next.id, next);
    return next;
  }
  const cur = await postgresExecutor().query<{ state: string }>(`SELECT state FROM standing_orders_v1 WHERE id = $1`, [order.id]);
  if (!cur.rows[0]) return null;
  const next = cur.rows[0].state === 'paused' && order.state === 'on' ? { ...order, state: 'paused' as const } : order;
  await postgresExecutor().query(`UPDATE standing_orders_v1 SET state = $2, next_at = $3, data = $4 WHERE id = $1`, [next.id, next.state, next.nextAt, next]);
  return next;
}

export async function removeOrder(owner: string, id: string): Promise<boolean> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    const x = mem.get(id);
    if (!x || x.owner !== o) return false;
    mem.delete(id);
    return true;
  }
  const r = await postgresExecutor().query(`DELETE FROM standing_orders_v1 WHERE id = $1 AND owner = $2 RETURNING id`, [id, o]);
  return r.rows.length === 1;
}

/// Claims the orders due now. Each is taken by one sweep only: the write that
/// moves its next run on succeeds only while the row still holds the time read.
export async function claimDueOrders(now: number, nextAfter: (o: StandingOrder) => Promise<number>, limit = 50): Promise<StandingOrder[]> {
  const due = !pgEnabled
    ? [...mem.values()].filter((o) => o.state === 'on' && o.nextAt <= now).slice(0, limit)
    : (await postgresExecutor().query<{ data: unknown }>(`SELECT data FROM standing_orders_v1 WHERE state = 'on' AND next_at <= $1 ORDER BY next_at LIMIT $2`, [now, limit])).rows.map(rowOf);
  const out: StandingOrder[] = [];
  for (const o of due) {
    const next: StandingOrder = { ...o, nextAt: await nextAfter(o) };
    let won = false;
    if (!pgEnabled) {
      const cur = mem.get(o.id);
      if (cur && cur.state === 'on' && cur.nextAt === o.nextAt) {
        mem.set(o.id, { ...cur, nextAt: next.nextAt });
        won = true;
      }
    } else {
      const r = await postgresExecutor().query(
        `UPDATE standing_orders_v1 SET next_at = $3, data = jsonb_set(data, '{nextAt}', to_jsonb($3::bigint)) WHERE id = $1 AND next_at = $2 AND state = 'on' RETURNING id`,
        [o.id, o.nextAt, next.nextAt],
      );
      won = r.rows.length === 1;
    }
    if (won) out.push(next);
  }
  return out;
}

/// Account deletion.
export async function deleteOrdersOf(owner: string): Promise<void> {
  const o = owner.toLowerCase();
  if (!pgEnabled) {
    for (const [id, x] of mem) if (x.owner === o) mem.delete(id);
    return;
  }
  await postgresExecutor().query(`DELETE FROM standing_orders_v1 WHERE owner = $1`, [o]);
}

/// For tests only.
export function resetOrdersForTests(): void {
  mem.clear();
}
