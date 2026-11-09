/// How a seller's agent moves between its opening and its lowest (view 41):
/// firm while there is time and little competition, steadier near the deadline
/// or with several competing offers, one step only after the other side moved,
/// a little different per seller so nothing looks programmed, never under the
/// floor, at most five exchanges with the fourth a last price, and a question
/// to the person past that. Pure: the caller supplies time, counts and a seed.

export const MAX_EXCHANGES = 5;
export const LAST_PRICE_EXCHANGE = 4;
export const FIRM_BETA = 0.3;
export const STEADY_BETA = 1;
export const JITTER_PCT = 5;

export interface ConcessionInput {
  opening: number;
  floor: number;
  /// The agent's standing price on the request.
  current: number;
  /// Share of the request's time already used, 0 to 1.
  timeUsed: number;
  /// How many times the agent has answered the other side on this request.
  exchanges: number;
  /// Other offers the buyer has on the request.
  competitors: number;
  /// The other side's latest price, and whether it moved since their last one.
  theirPrice: number;
  theirMoved: boolean;
  /// Stable per seller and request, so two sellers step differently.
  seed: string;
  /// A longer delivery the agent may offer once before crossing the floor, in days.
  tradeDays?: number | null;
  traded?: boolean;
  /// Agree for me (view 41, decision 7): the agent may take a price inside the
  /// person's limits on its own. Off, it asks before agreeing under its own offer.
  agreeInsideLimits: boolean;
}

export type ConcessionMove =
  | { kind: 'accept'; price: number }
  | { kind: 'hold'; price: number }
  | { kind: 'step'; price: number }
  | { kind: 'last-price'; price: number }
  | { kind: 'trade'; price: number; days: number }
  | { kind: 'ask' };

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const money = (n: number) => Number(n.toFixed(2));

/// Firm (0.3) while more than half the time is left and at most one competing
/// offer is known; steady (1) near the deadline or with three or more.
export function betaFor(timeUsed: number, competitors: number): number {
  return clamp01(timeUsed) > 0.5 || competitors >= 3 ? STEADY_BETA : FIRM_BETA;
}

/// f + (o - f) × (1 - t^(1/β)): the price the schedule allows at share t.
export function scheduledPrice(opening: number, floor: number, t: number, beta: number): number {
  if (opening <= floor) return floor;
  return floor + (opening - floor) * (1 - Math.pow(clamp01(t), 1 / beta));
}

/// A stable fraction in [-JITTER_PCT, JITTER_PCT] percent from the seed.
export function jitterFor(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash ^ seed.charCodeAt(i)) * 16777619) >>> 0;
  return ((hash % 2001) / 1000 - 1) * (JITTER_PCT / 100);
}

export function nextSellerMove(i: ConcessionInput): ConcessionMove {
  return nextMove({ ...i, role: 'seller', limit: i.floor, midpointUsed: true, budgetUsdc: null, betterOffer: false }) as ConcessionMove;
}

/// View 73 (spec S6, S8, S9, S10): one schedule for both sides. The seller
/// steps down toward its lowest; the buyer steps up toward budget plus leeway,
/// worked as the seller's schedule on mirrored prices.
export type Role = 'buyer' | 'seller';

export interface MoveInput extends Omit<ConcessionInput, 'floor'> {
  role: Role;
  /// The seller's lowest, or the buyer's budget plus leeway.
  limit: number;
  midpointUsed: boolean;
  /// Sets the 5 percent gap for meeting in the middle; null turns it off.
  budgetUsdc: number | null;
  /// The buyer holds a better offer (decision 12): the seller steps steadier.
  betterOffer: boolean;
}

export type Move = ConcessionMove | { kind: 'midpoint'; price: number };

const MIDPOINT_AFTER = 3;
const MIDPOINT_GAP = 0.05;
const BETTER_OFFER_COMPETITORS = 3;

export function nextMove(i: MoveInput): Move {
  const sign = i.role === 'seller' ? 1 : -1;
  const m = moveOnSellerScale({
    ...i,
    opening: sign * i.opening,
    floor: sign * i.limit,
    current: sign * i.current,
    theirPrice: sign * i.theirPrice,
    competitors: i.competitors + (i.betterOffer ? BETTER_OFFER_COMPETITORS : 0),
  });
  if (m.kind === 'ask') return m;
  return { ...m, price: money(sign * m.price) };
}

function moveOnSellerScale(i: ConcessionInput & Pick<MoveInput, 'role' | 'midpointUsed' | 'budgetUsdc'>): Move {
  const floor = i.floor;
  const current = Math.max(i.current, floor);
  // The other side meets the standing price: agreed, whatever the mode.
  if (i.theirPrice >= current) return { kind: 'accept', price: current };
  if (i.exchanges >= MAX_EXCHANGES) return { kind: 'ask' };
  // Close, after three exchanges, and this side moved last: meet in the middle, once.
  if (
    !i.theirMoved &&
    !i.midpointUsed &&
    i.budgetUsdc !== null &&
    i.budgetUsdc > 0 &&
    i.exchanges >= MIDPOINT_AFTER &&
    current - i.theirPrice < MIDPOINT_GAP * i.budgetUsdc
  ) {
    const mid = (current + i.theirPrice) / 2;
    if (mid >= floor) return { kind: 'midpoint', price: mid };
  }
  if (!i.theirMoved) return { kind: 'hold', price: current };

  const t = Math.max(clamp01(i.timeUsed), clamp01(i.exchanges / MAX_EXCHANGES));
  const target = scheduledPrice(i.opening, floor, t, betaFor(i.timeUsed, i.competitors));
  const step = Math.max(0, current - target) * (1 + jitterFor(i.seed));
  const price = money(Math.max(floor, Math.min(current, current - step)));

  // Their price is inside the limits and at or past where the agent would
  // step to: take it when the person allowed that, else ask them.
  if (i.theirPrice >= Math.max(floor, price)) {
    return i.agreeInsideLimits ? { kind: 'accept', price: i.theirPrice } : { kind: 'ask' };
  }
  const canTrade = !i.traded && !!i.tradeDays && i.tradeDays > 0;
  if (i.exchanges === LAST_PRICE_EXCHANGE - 1) {
    // The buyer offers more days once, before its last price (spec S9).
    if (i.role === 'buyer' && canTrade) return { kind: 'trade', price: current, days: i.tradeDays! };
    return { kind: 'last-price', price };
  }
  // Before crossing to the floor, offer time instead of money, once.
  if (i.role === 'seller' && price <= floor + 0.005 && canTrade) return { kind: 'trade', price: current, days: i.tradeDays! };
  if (price >= current) return { kind: 'hold', price: current };
  return { kind: 'step', price };
}
