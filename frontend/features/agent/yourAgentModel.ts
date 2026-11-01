import type { UserProfile } from '@/core/api';
import { waysOf, type AgentWays, type SellWay } from '@/features/profile/ways';

/// The Your agent page (docs/architecture/45-your-agent.md): the rules behind
/// its rows. Every change is a whole set of ways for POST /api/setup/ways.

export type PaidKind = 'one_time' | 'milestones' | 'goods';
type PricedWay = Extract<SellWay, { priceUsual: number }>;

const priced = (w: SellWay): w is PricedWay => 'priceUsual' in w && typeof w.priceUsual === 'number';
const workKinds = new Set<string>(['one_time', 'milestones', 'goods']);

/// The way the page's price and payment rows speak for: the first one-time,
/// stages or goods way, else the first priced one.
export function mainWayIndex(ways: AgentWays): number {
  const work = ways.sell.findIndex((w) => workKinds.has(w.shape));
  return work >= 0 ? work : ways.sell.findIndex(priced);
}

export function mainWay(ways: AgentWays): PricedWay | null {
  const w = ways.sell[mainWayIndex(ways)];
  return w && priced(w) ? w : null;
}

/// Whether the agent has a usual price the person gave (view 41, decision 14).
/// Without one, it offers at the buyer's budget, and the page says so.
export function sellerUsualGiven(profile: Pick<UserProfile, 'seller' | 'agentWays'> | null | undefined): boolean {
  if (!profile?.seller) return true;
  if (profile.agentWays) return waysOf(profile).sell.some((w) => priced(w) && !w.usualGuessed);
  return profile.seller.usualSet === true;
}

const without = (w: PricedWay): PricedWay => {
  if (!w.usualGuessed) return w;
  const { usualGuessed: _guess, ...rest } = w;
  return rest as PricedWay;
};

export function withPrice(ways: AgentWays, price: { lowest: number; usual: number }): AgentWays {
  const i = mainWayIndex(ways);
  const w = ways.sell[i];
  if (!w || !priced(w)) return ways;
  const sell = ways.sell.slice();
  sell[i] = { ...without(w), priceMin: price.lowest, priceUsual: price.usual };
  return { ...ways, sell };
}

export function priceProblem(lowest: number, usual: number): 'missing' | 'order' | null {
  if (!Number.isFinite(lowest) || !Number.isFinite(usual) || lowest <= 0 || usual <= 0) return 'missing';
  return lowest > usual ? 'order' : null;
}

export function daysProblem(min: number, max: number): 'missing' | 'order' | null {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < 1) return 'missing';
  return min > max ? 'order' : null;
}

export function paidKindOf(ways: AgentWays): PaidKind | null {
  const w = mainWay(ways);
  return w && workKinds.has(w.shape) ? (w.shape as PaidKind) : null;
}

export function daysOf(w: PricedWay | null): { min: number; max: number } | null {
  if (!w) return null;
  if (w.shape === 'goods') return { min: w.arriveDaysMin, max: w.arriveDaysMax };
  if ('daysMin' in w) return { min: w.daysMin, max: w.daysMax };
  return null;
}

/// How the person gets paid: the main way becomes that kind with its price
/// kept. A way of that kind already listed is replaced, so there is never two.
export function withPaid(
  ways: AgentWays,
  choice: { kind: PaidKind; daysMin: number; daysMax: number; what?: string; shipsTo?: string },
): AgentWays {
  const i = mainWayIndex(ways);
  const current = ways.sell[i];
  // Only the payment changes here; a carried-over usual price stays marked.
  const base = current && priced(current) ? current : null;
  const guessed = base?.usualGuessed ? { usualGuessed: true as const } : {};
  const lowest = base?.priceMin ?? 0;
  const usual = base?.priceUsual ?? 0;
  const replaced = ways.sell.find((w, k) => k !== i && w.shape === choice.kind);
  const stages = replaced?.shape === 'milestones' ? replaced.stages : current?.shape === 'milestones' ? current.stages : 2;
  const next: SellWay =
    choice.kind === 'goods'
      ? { shape: 'goods', what: choice.what?.trim() ?? '', priceMin: lowest, priceUsual: usual, ...guessed, perItem: current?.shape === 'goods' ? current.perItem ?? true : true, shipsTo: choice.shipsTo?.trim() ?? '', arriveDaysMin: choice.daysMin, arriveDaysMax: choice.daysMax }
      : choice.kind === 'milestones'
        ? { shape: 'milestones', priceMin: lowest, priceUsual: usual, ...guessed, daysMin: choice.daysMin, daysMax: choice.daysMax, stages }
        : { shape: 'one_time', priceMin: lowest, priceUsual: usual, ...guessed, daysMin: choice.daysMin, daysMax: choice.daysMax };
  const sell = ways.sell.filter((w, k) => k === i || w.shape !== choice.kind);
  const at = sell.indexOf(ways.sell[i]!);
  if (at >= 0) sell[at] = next;
  else sell.unshift(next);
  return { ...ways, sell };
}
