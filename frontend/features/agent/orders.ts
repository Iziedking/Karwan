import type { StandingOrder, StandingOrderInput } from '@/core/api';
import type { AgentOrdersCopy } from '@/shared/i18n/messages/agentOrders';

/// Standing orders as the screens show them (view 87, step 4). Pure: the
/// server decides every change; this only says what to draw and what to send.

export const ORDERS_KEY = ['agent-orders'] as const;
export const PER_DAY_CHOICES = [1, 2, 3, 4, 5] as const;
/// "Until": days from today; 0 is until the person stops it.
export const UNTIL_CHOICES = [0, 1, 2, 3, 4, 5, 6, 7, 10, 14, 21, 30, 60, 90] as const;
const DAY_MS = 86_400_000;
const NEED_MIN = 3;
export const NEED_MAX = 200;

const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => String(values[key] ?? whole));

export interface OrderText {
  /// The most for one, as the person reads it.
  amount: (order: Pick<StandingOrder, 'budgetUsdc' | 'said'>) => string;
  /// A day, as "Fri 20 Nov".
  date: (at: number) => string;
  /// The person's own city, for a selling order.
  city: string | null;
  /// Between the two parts of a row's second line.
  comma: string;
}

export interface OrderRowView {
  id: string;
  title: string;
  line: string;
  value: string;
}

export function untilLine(until: number | null, copy: AgentOrdersCopy, text: Pick<OrderText, 'date'>): string {
  return until === null ? copy.untilStopLine : fill(copy.untilDate, { date: text.date(until) });
}

/// What an order's row says it did, or what it waits for.
export function orderValue(o: Pick<StandingOrder, 'state' | 'waitsFor' | 'askedToday'>, copy: AgentOrdersCopy): string {
  if (o.state === 'paused') return copy.paused;
  if (o.state === 'done') return copy.done;
  if (o.state === 'ended') return copy.ended;
  if (o.waitsFor === 'location') return copy.needsLocation;
  if (o.waitsFor === 'money') return copy.needsMoney;
  return fill(copy.askedToday, { n: o.askedToday });
}

/// Each order as a row: what it is, its limit and end, and what it did today.
export function orderRows(orders: readonly StandingOrder[], copy: AgentOrdersCopy, text: OrderText): OrderRowView[] {
  return orders.map((o) => {
    const first = o.side === 'buy' && o.budgetUsdc !== null ? fill(copy.upTo, { amount: text.amount(o) }) : text.city ? fill(copy.inCity, { city: text.city }) : copy.usualPrice;
    return { id: o.id, title: o.need, line: `${first}${text.comma}${untilLine(o.until, copy, text)}`, value: orderValue(o, copy) };
  });
}

/// Whether one more order may be added: five running or paused is the most.
export function canAdd(orders: readonly StandingOrder[], max: number): boolean {
  return orders.filter((o) => o.state === 'on' || o.state === 'paused').length < max;
}

export interface OrderDraft {
  side: StandingOrder['side'];
  need: string;
  budgetUsdc: number | null;
  kind: StandingOrder['kind'];
  perDay: number;
  untilDays: number;
}

export const EMPTY_DRAFT: OrderDraft = { side: 'buy', need: '', budgetUsdc: null, kind: 'goods', perDay: 5, untilDays: 0 };

export function canStart(d: OrderDraft): boolean {
  const need = d.need.trim();
  if (need.length < NEED_MIN || need.length > NEED_MAX) return false;
  return d.side === 'sell' || (d.budgetUsdc !== null && d.budgetUsdc > 0);
}

/// What starting the draft sends. A selling order carries no budget.
export function startBody(d: OrderDraft, typed: { currency: string; amount: string } | null): StandingOrderInput {
  const buying = d.side === 'buy';
  return {
    side: d.side,
    need: d.need.trim(),
    budgetUsdc: buying ? d.budgetUsdc : null,
    ...(buying && typed && Number(typed.amount) > 0 ? { said: { currency: typed.currency, amount: Number(typed.amount) } } : {}),
    kind: d.kind,
    perDay: d.perDay,
    ...(d.untilDays > 0 ? { untilDays: d.untilDays } : {}),
  };
}

/// A day as the screens write it: "Fri 20 Nov".
export function dayText(at: number, locale: string): string {
  const d = new Date(at);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, options).format(d);
  return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })}`;
}

/// The day an "until" choice lands on, from now.
export const untilAt = (days: number, now: number): number | null => (days > 0 ? now + days * DAY_MS : null);

export interface OrderEdit {
  budgetUsdc: number | null;
  perDay: number;
  /// Undefined keeps the date the order has.
  untilDays: number | undefined;
}

/// What saving the open order sends: only what the person changed, or null.
export function changeBody(o: StandingOrder, e: OrderEdit, typed: { currency: string; amount: string } | null): { budgetUsdc?: number; said?: { currency: string; amount: number }; perDay?: number; until?: null; untilDays?: number } | null {
  const out: { budgetUsdc?: number; said?: { currency: string; amount: number }; perDay?: number; until?: null; untilDays?: number } = {};
  if (o.side === 'buy' && e.budgetUsdc !== null && e.budgetUsdc > 0 && Math.round(e.budgetUsdc * 100) !== Math.round(Number(o.budgetUsdc ?? 0) * 100)) {
    out.budgetUsdc = e.budgetUsdc;
    if (typed && Number(typed.amount) > 0) out.said = { currency: typed.currency, amount: Number(typed.amount) };
  }
  if (e.perDay !== o.perDay) out.perDay = e.perDay;
  if (e.untilDays !== undefined) {
    if (e.untilDays === 0) {
      if (o.until !== null) out.until = null;
    } else out.untilDays = e.untilDays;
  }
  return Object.keys(out).length ? out : null;
}
