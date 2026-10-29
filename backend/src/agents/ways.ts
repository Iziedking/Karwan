import { z } from 'zod';
import type { UserProfile } from '../db/profiles.js';

/// The ways a person deals (view 26). Each way is one escrow shape with the
/// few answers its contract needs, for selling and for buying. The selling
/// agent matches a request to the way of its shape; the account's older
/// seller and buyer settings are kept in step from the ways.
///
/// Only shapes the live escrow holds are offered. The others in view 26 join
/// LIVE_SHAPES as their contract family deploys.

export const LIVE_SHAPES = ['one_time', 'milestones', 'goods', 'deposit'] as const;
export type WayShape = (typeof LIVE_SHAPES)[number];

const usdc = z.number().finite().positive().max(1_000_000);
const days = z.number().int().min(1).max(365);
const words = (max: number) => z.string().trim().min(1).max(max);

// A selling way carries the lowest price the person takes (priceMin, the
// floor) and their usual price (view 41, phase 2). There is no highest: a
// bigger budget gets an offer opened from the usual price.
const sellOneTime = z.object({ shape: z.literal('one_time'), priceMin: usdc, priceUsual: usdc, daysMin: days, daysMax: days });
const sellMilestones = sellOneTime.extend({ shape: z.literal('milestones'), stages: z.number().int().min(2).max(5) });
const sellGoods = z.object({
  shape: z.literal('goods'),
  what: words(120),
  priceMin: usdc,
  priceUsual: usdc,
  shipsTo: words(120),
  arriveDaysMin: days,
  arriveDaysMax: days,
});
const sellDeposit = z.object({ shape: z.literal('deposit'), what: words(120), deposit: usdc, periodDays: days });

const buyOneTime = z.object({ shape: z.literal('one_time'), maxPrice: usdc, needDays: days });
const buyMilestones = buyOneTime.extend({ shape: z.literal('milestones'), pay: z.enum(['end', 'stages']) });
const buyGoods = z.object({ shape: z.literal('goods'), maxPrice: usdc, deliverTo: words(120), waitDays: days });
const buyDeposit = z.object({ shape: z.literal('deposit'), maxDeposit: usdc });

export const sellWaySchema = z
  .discriminatedUnion('shape', [sellOneTime, sellMilestones, sellGoods, sellDeposit])
  .refine((w) => (w.shape === 'deposit' ? true : w.priceMin <= w.priceUsual), { message: 'lowest price above usual' })
  .refine((w) => (w.shape === 'goods' ? w.arriveDaysMin <= w.arriveDaysMax : w.shape === 'deposit' ? true : w.daysMin <= w.daysMax), {
    message: 'shortest time above longest',
  });
export const buyWaySchema = z.discriminatedUnion('shape', [buyOneTime, buyMilestones, buyGoods, buyDeposit]);

const oneEach = (list: Array<{ shape: string }>) => new Set(list.map((w) => w.shape)).size === list.length;

export const waysSchema = z.object({
  sell: z.array(sellWaySchema).max(LIVE_SHAPES.length).refine(oneEach, { message: 'one way per shape' }),
  buy: z.array(buyWaySchema).max(LIVE_SHAPES.length).refine(oneEach, { message: 'one way per shape' }),
});

export type SellWay = z.infer<typeof sellWaySchema>;
export type BuyWay = z.infer<typeof buyWaySchema>;
export type AgentWays = z.infer<typeof waysSchema>;

/// One price is the lowest and the usual; a range makes its low end the lowest
/// and its midpoint the usual (view 41, decision 2).
export function usualOf(lo: number, hi: number): number {
  return lo === hi ? lo : Number(((lo + hi) / 2).toFixed(2));
}

function upgradeSellWay(w: unknown): unknown {
  if (!w || typeof w !== 'object') return w;
  const o = w as Record<string, unknown>;
  if (o.shape === 'deposit' || typeof o.priceMin !== 'number') return w;
  const { priceMax, ...rest } = o;
  if (typeof rest.priceUsual === 'number') return rest;
  const hi = typeof priceMax === 'number' ? priceMax : o.priceMin;
  return { ...rest, priceUsual: usualOf(o.priceMin, hi) };
}

/// Ways saved before the usual price: a range becomes lowest and usual, one
/// price is both, and the old highest is dropped. Ways already in the new
/// shape pass through, so this can run on every read and twice is harmless.
export function upgradeWays<T>(raw: T): T {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { sell?: unknown }).sell)) return raw;
  return { ...(raw as object), sell: (raw as unknown as { sell: unknown[] }).sell.map(upgradeSellWay) } as T;
}

/// The account's ways: the saved ones, or for an account that never saved
/// any, the one way its current settings describe.
export function waysOf(profile: Pick<UserProfile, 'agentWays' | 'seller' | 'buyer'>): AgentWays & { saved: boolean } {
  if (profile.agentWays) return { ...upgradeWays(profile.agentWays), saved: true };
  const s = profile.seller;
  const b = profile.buyer;
  const sell: SellWay[] = s
    ? [{ shape: 'one_time', priceMin: s.minBudgetUsdc, priceUsual: usualOf(s.minBudgetUsdc, s.maxBudgetUsdc), daysMin: s.minDeadlineDays, daysMax: s.maxDeadlineDays }]
    : [];
  const buy: BuyWay[] = b
    ? [
        b.milestonePcts.length > 1
          ? { shape: 'milestones', maxPrice: b.maxBudgetUsdc, needDays: b.maxDeadlineDays, pay: 'stages' }
          : { shape: 'one_time', maxPrice: b.maxBudgetUsdc, needDays: b.maxDeadlineDays },
      ]
    : [];
  return { sell, buy, saved: false };
}

/// The selling way a request falls under. Goods go to the goods way; work goes
/// to one-time, else milestones. Deposits are agreed directly, never matched.
export function fittingWay(sell: readonly SellWay[], requestKind: 'service' | 'goods' | 'mixed' | null | undefined): SellWay | null {
  const of = (shape: WayShape) => sell.find((w) => w.shape === shape) ?? null;
  if (requestKind === 'goods') return of('goods');
  return of('one_time') ?? of('milestones');
}

interface Limits {
  minBudgetUsdc: number;
  /// The usual price, kept under the older name for every reader that predates
  /// the ways. It is a starting point, never a cap (view 41).
  maxBudgetUsdc: number;
  usualPriceUsdc?: number;
  minDeadlineDays: number;
  maxDeadlineDays: number;
}

/// The floor, usual price and time the agent acts from, taken from one way.
export function withWayLimits<T extends Limits>(seller: T, way: SellWay): T {
  switch (way.shape) {
    case 'goods':
      return { ...seller, minBudgetUsdc: way.priceMin, maxBudgetUsdc: way.priceUsual, usualPriceUsdc: way.priceUsual, minDeadlineDays: way.arriveDaysMin, maxDeadlineDays: way.arriveDaysMax };
    case 'deposit':
      return seller;
    default:
      return { ...seller, minBudgetUsdc: way.priceMin, maxBudgetUsdc: way.priceUsual, usualPriceUsdc: way.priceUsual, minDeadlineDays: way.daysMin, maxDeadlineDays: way.daysMax };
  }
}

const sellRange = (w: SellWay) =>
  w.shape === 'deposit'
    ? null
    : w.shape === 'goods'
      ? { lo: w.priceMin, hi: w.priceUsual, dLo: w.arriveDaysMin, dHi: w.arriveDaysMax }
      : { lo: w.priceMin, hi: w.priceUsual, dLo: w.daysMin, dHi: w.daysMax };

/// The older seller and buyer settings, rewritten from the ways so every
/// reader that predates them (pricing, the market sweep, the forms) agrees.
export function legacyFromWays(ways: AgentWays, current: Pick<UserProfile, 'seller' | 'buyer'>): Pick<UserProfile, 'seller' | 'buyer'> {
  let seller = current.seller;
  const ranges = ways.sell.map(sellRange).filter((r): r is NonNullable<typeof r> => r !== null);
  if (ranges.length) {
    const goods = ways.sell.some((w) => w.shape === 'goods');
    const work = ways.sell.some((w) => w.shape === 'one_time' || w.shape === 'milestones');
    const goodsWay = ways.sell.find((w) => w.shape === 'goods');
    seller = {
      skills: current.seller?.skills?.length ? current.seller.skills : [goodsWay?.shape === 'goods' ? goodsWay.what : 'services'],
      bio: current.seller?.bio ?? '',
      ...(current.seller?.keywords ? { keywords: current.seller.keywords } : {}),
      tradeType: goods && work ? 'both' : goods ? 'goods' : 'services',
      minBudgetUsdc: Math.min(...ranges.map((r) => r.lo)),
      // The highest usual price, under the older name; no reader treats it as a cap.
      maxBudgetUsdc: Math.max(...ranges.map((r) => r.hi)),
      minDeadlineDays: Math.min(...ranges.map((r) => r.dLo)),
      maxDeadlineDays: Math.max(...ranges.map((r) => r.dHi)),
    };
  }
  let buyer = current.buyer;
  if (ways.buy.length) {
    const most = Math.max(...ways.buy.map((w) => (w.shape === 'deposit' ? w.maxDeposit : w.maxPrice)));
    const waits = ways.buy.map((w) => (w.shape === 'goods' ? w.waitDays : w.shape === 'deposit' ? 0 : w.needDays)).filter((d) => d > 0);
    const byStage = ways.buy.some((w) => w.shape === 'milestones' && w.pay === 'stages');
    const pcts = current.buyer?.milestonePcts ?? [100];
    buyer = {
      maxBudgetUsdc: most,
      minDeadlineDays: current.buyer?.minDeadlineDays ?? 1,
      maxDeadlineDays: waits.length ? Math.max(...waits) : current.buyer?.maxDeadlineDays ?? 14,
      bidCollectionSeconds: current.buyer?.bidCollectionSeconds ?? 45,
      milestonePcts: byStage ? (pcts.length > 1 ? pcts : [50, 50]) : [100],
    };
  }
  return { seller, buyer };
}

const SHAPE_WORDS: Record<WayShape, string> = {
  one_time: 'one-time',
  milestones: 'milestones',
  goods: 'goods with delivery',
  deposit: 'refundable deposit',
};
const span = (lo: number | string, hi: number | string) => (lo === hi ? `${lo}` : `${lo} to ${hi}`);
const whole = (n: number) => n.toLocaleString('en-US');
const priceWords = (lo: number, usual: number) => (lo === usual ? `${whole(lo)} USDC` : `usually ${whole(usual)} USDC, lowest ${whole(lo)}`);

/// One plain line per way, for the confirm card and chat.
export function wayLines(ways: Pick<AgentWays, 'sell' | 'buy'>): string[] {
  const sell = ways.sell.map((w) => {
    const head = `Selling, ${SHAPE_WORDS[w.shape]}: `;
    switch (w.shape) {
      case 'goods':
        return `${head}${w.what}, ${priceWords(w.priceMin, w.priceUsual)}, to ${w.shipsTo}, arrives in ${span(w.arriveDaysMin, w.arriveDaysMax)} days`;
      case 'deposit':
        return `${head}${w.what}, ${whole(w.deposit)} USDC deposit for ${w.periodDays} days`;
      case 'milestones':
        return `${head}${priceWords(w.priceMin, w.priceUsual)} in ${w.stages} stages, done in ${span(w.daysMin, w.daysMax)} days`;
      default:
        return `${head}${priceWords(w.priceMin, w.priceUsual)}, done in ${span(w.daysMin, w.daysMax)} days`;
    }
  });
  const buy = ways.buy.map((w) => {
    const head = `Buying, ${SHAPE_WORDS[w.shape]}: `;
    switch (w.shape) {
      case 'goods':
        return `${head}up to ${whole(w.maxPrice)} USDC, delivered to ${w.deliverTo}, within ${w.waitDays} days`;
      case 'deposit':
        return `${head}deposits up to ${whole(w.maxDeposit)} USDC`;
      case 'milestones':
        return `${head}up to ${whole(w.maxPrice)} USDC, within ${w.needDays} days, ${w.pay === 'stages' ? 'paid stage by stage' : 'paid at the end'}`;
      default:
        return `${head}up to ${whole(w.maxPrice)} USDC, within ${w.needDays} days`;
    }
  });
  return [...sell, ...buy];
}

/// The Edit profile form still writes the older settings: its price fields are
/// the lowest and the usual. When an account has saved ways, its work way takes
/// the form's price and time, and a side the form dropped (a role switched off)
/// loses its ways, so the two never differ.
export function reconcileWays(ways: AgentWays, seller: UserProfile['seller'], buyer: UserProfile['buyer']): AgentWays {
  const sell: SellWay[] = !seller
    ? []
    : ways.sell.map((w) =>
        w.shape === 'one_time' || w.shape === 'milestones'
          ? { ...w, priceMin: seller.minBudgetUsdc, priceUsual: Math.max(seller.minBudgetUsdc, seller.maxBudgetUsdc), daysMin: seller.minDeadlineDays, daysMax: seller.maxDeadlineDays }
          : w,
      );
  const buy: BuyWay[] = !buyer
    ? []
    : ways.buy.map((w) => (w.shape === 'one_time' || w.shape === 'milestones' ? { ...w, maxPrice: buyer.maxBudgetUsdc, needDays: buyer.maxDeadlineDays } : w));
  return { sell, buy };
}

/// The selling agent as it should act on one request. With saved ways it bids
/// inside the way of the request's shape. A request of a shape the person does
/// not offer is not bid on: the owner is told and decides (view 26, a buyer
/// may propose a shape). Without saved ways nothing changes.
export function sellerForRequest<T extends Limits & { ways?: SellWay[]; agentMode?: 'offers' | 'ask' }>(
  seller: T,
  requestKind: 'service' | 'goods' | 'mixed' | null | undefined,
): T {
  if (!seller.ways) return seller;
  const way = fittingWay(seller.ways, requestKind);
  return way ? withWayLimits(seller, way) : { ...seller, agentMode: 'ask' };
}

/// One way added, changed or removed, the rest kept as they are.
export function withWay(current: Pick<AgentWays, 'sell' | 'buy'>, side: 'sell' | 'buy', shape: WayShape, way: SellWay | BuyWay | null): AgentWays {
  const replace = <W extends { shape: WayShape }>(list: readonly W[], next: W | null): W[] => {
    const at = list.findIndex((w) => w.shape === shape);
    if (at < 0) return next ? [...list, next] : [...list];
    return next ? [...list.slice(0, at), next, ...list.slice(at + 1)] : [...list.slice(0, at), ...list.slice(at + 1)];
  };
  return side === 'sell'
    ? { sell: replace(current.sell, way as SellWay | null), buy: [...current.buy] }
    : { sell: [...current.sell], buy: replace(current.buy, way as BuyWay | null) };
}
