import type { UserProfile } from '@/core/api';
import type { WaysCopy } from '@/shared/i18n/messages/ways';

/// The ways a person deals (docs/architecture/26-agents-for-every-deal.md).
/// The server is the authority (backend/src/agents/ways.ts); this mirrors its
/// shapes and rules so the form can say what is missing before saving.

export const LIVE_SHAPES = ['one_time', 'milestones', 'goods', 'deposit'] as const;
export type WayShape = (typeof LIVE_SHAPES)[number];
export type Side = 'sell' | 'buy';

export type SellWay =
  | { shape: 'one_time'; priceMin: number; priceMax: number; daysMin: number; daysMax: number }
  | { shape: 'milestones'; priceMin: number; priceMax: number; daysMin: number; daysMax: number; stages: number }
  | { shape: 'goods'; what: string; priceMin: number; priceMax: number; shipsTo: string; arriveDaysMin: number; arriveDaysMax: number }
  | { shape: 'deposit'; what: string; deposit: number; periodDays: number };

export type BuyWay =
  | { shape: 'one_time'; maxPrice: number; needDays: number }
  | { shape: 'milestones'; maxPrice: number; needDays: number; pay: 'end' | 'stages' }
  | { shape: 'goods'; maxPrice: number; deliverTo: string; waitDays: number }
  | { shape: 'deposit'; maxDeposit: number };

export interface AgentWays {
  sell: SellWay[];
  buy: BuyWay[];
}

/// Saved ways, or the one way an account's older settings describe.
export function waysOf(profile: Pick<UserProfile, 'agentWays' | 'seller' | 'buyer'> | null | undefined): AgentWays {
  if (profile?.agentWays) return profile.agentWays;
  const s = profile?.seller;
  const b = profile?.buyer;
  return {
    sell: s ? [{ shape: 'one_time', priceMin: s.minBudgetUsdc, priceMax: s.maxBudgetUsdc, daysMin: s.minDeadlineDays, daysMax: s.maxDeadlineDays }] : [],
    buy: b
      ? [
          b.milestonePcts.length > 1
            ? { shape: 'milestones', maxPrice: b.maxBudgetUsdc, needDays: b.maxDeadlineDays, pay: 'stages' }
            : { shape: 'one_time', maxPrice: b.maxBudgetUsdc, needDays: b.maxDeadlineDays },
        ]
      : [],
  };
}

/// A new way's starting answers, taken from the account's other ways where
/// they say something, so the form opens near what the person charges.
export function blankWay(side: Side, shape: WayShape, ways: AgentWays): SellWay | BuyWay {
  if (side === 'sell') {
    const priced = ways.sell.find((w) => w.shape !== 'deposit') as Exclude<SellWay, { shape: 'deposit' }> | undefined;
    const lo = priced?.priceMin ?? 20;
    const hi = priced?.priceMax ?? 100;
    switch (shape) {
      case 'goods':
        return { shape, what: '', priceMin: lo, priceMax: hi, shipsTo: '', arriveDaysMin: 2, arriveDaysMax: 5 };
      case 'deposit':
        return { shape, what: '', deposit: 100, periodDays: 7 };
      case 'milestones':
        return { shape, priceMin: lo, priceMax: hi, daysMin: 7, daysMax: 30, stages: 2 };
      default:
        return { shape, priceMin: lo, priceMax: hi, daysMin: 1, daysMax: 7 };
    }
  }
  const most = ways.buy.find((w) => w.shape !== 'deposit') as Exclude<BuyWay, { shape: 'deposit' }> | undefined;
  const max = most?.maxPrice ?? 100;
  switch (shape) {
    case 'goods':
      return { shape, maxPrice: max, deliverTo: '', waitDays: 7 };
    case 'deposit':
      return { shape, maxDeposit: 200 };
    case 'milestones':
      return { shape, maxPrice: max, needDays: 30, pay: 'stages' };
    default:
      return { shape, maxPrice: max, needDays: 7 };
  }
}

const usdc = (n: number) => Number.isFinite(n) && n > 0 && n <= 1_000_000;
const days = (n: number) => Number.isInteger(n) && n >= 1 && n <= 365;
const words = (s: string) => s.trim().length > 0 && s.trim().length <= 120;

/// What stops a way from saving, the same rules the server applies.
export function wayProblem(side: Side, way: SellWay | BuyWay): 'missing' | 'order' | null {
  if (side === 'sell') {
    const w = way as SellWay;
    switch (w.shape) {
      case 'goods':
        if (!words(w.what) || !words(w.shipsTo) || !usdc(w.priceMin) || !usdc(w.priceMax) || !days(w.arriveDaysMin) || !days(w.arriveDaysMax)) return 'missing';
        return w.priceMin > w.priceMax || w.arriveDaysMin > w.arriveDaysMax ? 'order' : null;
      case 'deposit':
        return !words(w.what) || !usdc(w.deposit) || !days(w.periodDays) ? 'missing' : null;
      case 'milestones':
        if (!Number.isInteger(w.stages) || w.stages < 2 || w.stages > 5) return 'missing';
      // falls through
      default:
        if (!usdc(w.priceMin) || !usdc(w.priceMax) || !days(w.daysMin) || !days(w.daysMax)) return 'missing';
        return w.priceMin > w.priceMax || w.daysMin > w.daysMax ? 'order' : null;
    }
  }
  const w = way as BuyWay;
  switch (w.shape) {
    case 'goods':
      return !usdc(w.maxPrice) || !words(w.deliverTo) || !days(w.waitDays) ? 'missing' : null;
    case 'deposit':
      return !usdc(w.maxDeposit) ? 'missing' : null;
    default:
      return !usdc(w.maxPrice) || !days(w.needDays) ? 'missing' : null;
  }
}

/// Amounts read as they do everywhere else in Karwan: "5,000 USDC".
const whole = (n: number) => n.toLocaleString('en-US');
const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/// One line under the way's name: its price, time and place, in the reader's words.
export function waySummary(side: Side, way: SellWay | BuyWay, c: WaysCopy): string {
  const n = whole;
  const money = (lo: number, hi: number) => (lo === hi ? fill(c.usdc, { n: n(lo) }) : fill(c.usdcRange, { min: n(lo), max: n(hi) }));
  const time = (lo: number, hi: number) => (lo === hi ? fill(c.days, { n: n(lo) }) : fill(c.daysRange, { min: n(lo), max: n(hi) }));
  if (side === 'sell') {
    const w = way as SellWay;
    switch (w.shape) {
      case 'goods':
        return [w.what, money(w.priceMin, w.priceMax), fill(c.shipsToLine, { place: w.shipsTo }), time(w.arriveDaysMin, w.arriveDaysMax)].join(' · ');
      case 'deposit':
        return [w.what, fill(c.depositLine, { n: n(w.deposit) }), fill(c.days, { n: n(w.periodDays) })].join(' · ');
      case 'milestones':
        return [money(w.priceMin, w.priceMax), time(w.daysMin, w.daysMax), fill(c.stagesLine, { n: n(w.stages) })].join(' · ');
      default:
        return [money(w.priceMin, w.priceMax), time(w.daysMin, w.daysMax)].join(' · ');
    }
  }
  const w = way as BuyWay;
  switch (w.shape) {
    case 'goods':
      return [fill(c.upTo, { n: n(w.maxPrice) }), fill(c.deliverToLine, { place: w.deliverTo }), fill(c.within, { n: n(w.waitDays) })].join(' · ');
    case 'deposit':
      return fill(c.upTo, { n: n(w.maxDeposit) });
    case 'milestones':
      return [fill(c.upTo, { n: n(w.maxPrice) }), fill(c.within, { n: n(w.needDays) }), w.pay === 'stages' ? c.payStages : c.payEnd].join(' · ');
    default:
      return [fill(c.upTo, { n: n(w.maxPrice) }), fill(c.within, { n: n(w.needDays) })].join(' · ');
  }
}
