import type { BudgetRange } from './budgetRange.js';
import { buyerOpeningCounter } from './buyerOpening.js';
import { nextMove } from './concession.js';
import type { PendingCounter } from './requestNotes.js';

/// The buyer agent's book (view 73, decisions 6, 7, 10, 12; spec S7, S8,
/// S11): one negotiation per offer, all at once. Every decision is here and
/// pure; buyer.ts only feeds it events and performs the actions it returns.
/// A counter is written into the book before it is sent, so a restart sends
/// each unsent one again under the same key, once.

export interface Negotiation {
  seller: string;
  openedUsdc: number;
  /// The seller's standing price.
  standingUsdc: string;
  /// The buyer's standing counter, null before the first.
  mine: string | null;
  myOpeningUsdc: number;
  /// Answers the buyer has given; a term trade does not count (spec S9).
  exchanges: number;
  /// Counters written, the board key's round.
  rounds: number;
  midpointUsed: boolean;
  traded: boolean;
  counterable: boolean;
  state: 'open' | 'agreed' | 'ended' | 'asking';
  pending: PendingCounter | null;
  /// Whether the written counter says the buyer holds a better offer.
  pendingBetterOffer: boolean;
  watchdogDueAt: number | null;
  /// Resent once in this process after a restart; never stored.
  resumed?: boolean;
}

export type Book = Map<string, Negotiation>;

export type BookEvent =
  | { kind: 'offer'; seller: string; priceUsdc: string; counterable: boolean; postedUsdc?: string | null }
  | { kind: 'reply'; seller: string; priceUsdc: string; accepted: boolean }
  | { kind: 'timeout'; seller: string }
  | { kind: 'withdrawn'; seller: string }
  /// The person answered the agent's question (Agree for me off, spec S11).
  | { kind: 'agree'; seller: string }
  | { kind: 'keep'; seller: string };

export type BookAction =
  | { kind: 'counter'; seller: string; counter: PendingCounter; betterOffer: boolean }
  | { kind: 'agree'; seller: string; priceUsdc: string }
  | { kind: 'ask-person'; seller: string; priceUsdc: string; gapUsdc: string }
  | { kind: 'end'; seller: string; reason: string };

export interface BookContext {
  jobId: string;
  budgetUsdc: number;
  leewayPct: number;
  range: BudgetRange | null;
  marketUsdc: number | null;
  agreeForMe: boolean;
  /// Share of the request's time used, 0 to 1.
  timeUsed: number;
  /// Days the counter asks for, and the most the buyer can give (its latest date).
  deadlineDays: number;
  latestDays: number | null;
  /// Milliseconds.
  now: number;
  watchdogMs: number;
  /// Every live, listed offer: its blended score and price.
  liveScores: Map<string, { score: number; priceUsdc: number }>;
}

const money = (n: number) => n.toFixed(2);
const key = (s: string) => s.toLowerCase();

/// True only when another live offer is cheaper and scores at least as well (S8).
export function hasBetterOffer(seller: string, live: BookContext['liveScores']): boolean {
  const me = [...live].find(([s]) => key(s) === key(seller))?.[1];
  if (!me) return false;
  return [...live].some(([s, o]) => key(s) !== key(seller) && o.priceUsdc < me.priceUsdc && o.score >= me.score);
}

function writeCounter(n: Negotiation, price: number, days: number, ctx: BookContext): BookAction {
  n.rounds += 1;
  n.mine = money(price);
  n.pending = {
    seller: n.seller,
    priceUsdc: n.mine,
    deadlineUnix: Math.floor(ctx.now / 1000) + days * 86_400,
    deadlineDays: days,
    round: n.rounds,
    key: `counter:${ctx.jobId.toLowerCase()}:${key(n.seller)}:${n.rounds}`,
  };
  n.resumed = false;
  n.pendingBetterOffer = hasBetterOffer(n.seller, ctx.liveScores);
  n.watchdogDueAt = ctx.now + ctx.watchdogMs;
  return { kind: 'counter', seller: n.seller, counter: n.pending, betterOffer: n.pendingBetterOffer };
}

function agreeOrAsk(n: Negotiation, price: number, ctx: BookContext): BookAction {
  if (!ctx.agreeForMe) return ask(n, price);
  n.pending = null;
  n.watchdogDueAt = null;
  n.state = 'agreed';
  return { kind: 'agree', seller: n.seller, priceUsdc: money(price) };
}

/// The person decides: the seller's price and how far it is from the buyer's.
function ask(n: Negotiation, price: number): BookAction {
  n.standingUsdc = money(price);
  n.pending = null;
  n.watchdogDueAt = null;
  n.state = 'asking';
  const gap = Math.max(0, price - Number(n.mine ?? n.myOpeningUsdc));
  return { kind: 'ask-person', seller: n.seller, priceUsdc: money(price), gapUsdc: money(gap) };
}

function end(n: Negotiation, reason: string): BookAction {
  n.state = 'ended';
  n.pending = null;
  n.watchdogDueAt = null;
  return { kind: 'end', seller: n.seller, reason };
}

function open(book: Book, ev: Extract<BookEvent, { kind: 'offer' }>, ctx: BookContext): BookAction[] {
  const price = Number(ev.priceUsdc);
  const n: Negotiation = {
    seller: ev.seller,
    openedUsdc: price,
    standingUsdc: ev.priceUsdc,
    mine: null,
    myOpeningUsdc: price,
    exchanges: 0,
    rounds: 0,
    midpointUsed: false,
    traded: false,
    counterable: ev.counterable,
    state: 'open',
    pending: null,
    pendingBetterOffer: false,
    watchdogDueAt: null,
  };
  book.set(key(ev.seller), n);
  // A Fixed price over the budget stays put: no counter, a near match instead.
  if (!ev.counterable) return [end(n, 'fixed-over-budget')];
  const posted = ev.postedUsdc !== undefined && ev.postedUsdc !== null ? Number(ev.postedUsdc) : null;
  const first = buyerOpeningCounter({
    sellerOpeningUsdc: price,
    postedUsdc: posted,
    marketUsdc: ctx.marketUsdc,
    range: ctx.range,
    budgetUsdc: ctx.budgetUsdc,
    overBudget: ctx.budgetUsdc > 0 && price > ctx.budgetUsdc,
  });
  n.myOpeningUsdc = first;
  // Nothing to bargain: the offer already sits at the buyer's first counter.
  if (first >= price) return [agreeOrAsk(n, price, ctx)];
  n.exchanges = 1;
  return [writeCounter(n, first, ctx.deadlineDays, ctx)];
}

function answer(n: Negotiation, theirPrice: number, ctx: BookContext): BookAction[] {
  const before = Number(n.standingUsdc);
  n.standingUsdc = money(theirPrice);
  n.pending = null;
  const limit = ctx.budgetUsdc * (1 + Math.max(0, ctx.leewayPct) / 100);
  const move = nextMove({
    role: 'buyer',
    opening: n.myOpeningUsdc,
    limit,
    current: Number(n.mine ?? n.myOpeningUsdc),
    theirPrice,
    theirMoved: theirPrice < before,
    timeUsed: ctx.timeUsed,
    exchanges: n.exchanges,
    competitors: Math.max(0, ctx.liveScores.size - 1),
    seed: `${key(n.seller)}:${ctx.jobId.toLowerCase()}`,
    tradeDays: ctx.latestDays !== null && ctx.latestDays > ctx.deadlineDays ? ctx.latestDays : null,
    traded: n.traded,
    agreeInsideLimits: ctx.agreeForMe,
    midpointUsed: n.midpointUsed,
    budgetUsdc: ctx.budgetUsdc > 0 ? ctx.budgetUsdc : null,
    betterOffer: false,
  });
  switch (move.kind) {
    case 'accept':
      return [agreeOrAsk(n, move.price, ctx)];
    case 'ask':
      // Past the fifth answer, or inside the limits with Agree for me off.
      return [ask(n, theirPrice)];
    case 'trade':
      n.traded = true;
      return [writeCounter(n, move.price, move.days, ctx)];
    case 'midpoint':
      n.midpointUsed = true;
      n.exchanges += 1;
      return [writeCounter(n, move.price, ctx.deadlineDays, ctx)];
    default:
      n.exchanges += 1;
      return [writeCounter(n, move.price, ctx.deadlineDays, ctx)];
  }
}

export function stepBook(book: Book, ev: BookEvent, ctx: BookContext): BookAction[] {
  const n = book.get(key(ev.seller));
  if (ev.kind === 'offer') {
    if (!n) return open(book, ev, ctx);
    // A new price from a seller already in the book is their answer.
    return n.state === 'open' ? answer(n, Number(ev.priceUsdc), ctx) : [];
  }
  if (ev.kind === 'agree' || ev.kind === 'keep') return n ? personAnswered(n, ev.kind, ctx) : [];
  if (!n || n.state !== 'open') return [];
  if (ev.kind === 'withdrawn') return [end(n, 'withdrawn')];
  if (ev.kind === 'timeout') return [end(n, 'no-reply')];
  if (ev.accepted) return [agreeOrAsk(n, Number(n.mine ?? ev.priceUsdc), ctx)];
  return answer(n, Number(ev.priceUsdc), ctx);
}

/// The person's answer to "your call": agree at the seller's price, or let the
/// agent keep bargaining (it holds at its own counter, once more), or, past the
/// last exchange, end the negotiation.
function personAnswered(n: Negotiation, choice: 'agree' | 'keep', ctx: BookContext): BookAction[] {
  if (n.state !== 'asking') return [];
  if (choice === 'agree') {
    n.state = 'agreed';
    return [{ kind: 'agree', seller: n.seller, priceUsdc: money(Number(n.standingUsdc)) }];
  }
  if (n.exchanges >= 5) return [end(n, 'no-agreement')];
  n.state = 'open';
  n.exchanges += 1;
  return [writeCounter(n, Number(n.mine ?? n.myOpeningUsdc), ctx.deadlineDays, ctx)];
}

/// The negotiations waiting on the person: the seller's price and the agent's own.
export function yourCalls(book: Book): Map<string, { priceUsdc: number; offeredUsdc: number }> {
  const out = new Map<string, { priceUsdc: number; offeredUsdc: number }>();
  for (const n of book.values()) {
    if (n.state === 'asking') out.set(key(n.seller), { priceUsdc: Number(n.standingUsdc), offeredUsdc: Number(n.mine ?? n.myOpeningUsdc) });
  }
  return out;
}

/// After a restart: every counter written but not sent goes out again under
/// its own key, once per process.
export function resumeBook(book: Book): BookAction[] {
  const out: BookAction[] = [];
  for (const n of book.values()) {
    if (n.state !== 'open' || !n.pending || n.resumed) continue;
    n.resumed = true;
    out.push({ kind: 'counter', seller: n.seller, counter: n.pending, betterOffer: n.pendingBetterOffer });
  }
  return out;
}

/// The board took the counter: it is no longer waiting to be sent.
export function counterSent(book: Book, seller: string, counterKey: string): void {
  const n = book.get(key(seller));
  if (n?.pending?.key === counterKey) n.pending = null;
}
