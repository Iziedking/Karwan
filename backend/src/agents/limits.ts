/// Whether the selling agent acts on a request that fits, or asks its person
/// first (view 41). Limits never make the agent go quiet: inside them it
/// offers, outside them it asks with a suggested answer the person can take,
/// change or turn down. Fit is decided before this is called.

/// There is no price-above-usual: a budget above the usual price is an offer,
/// opened from the usual price (view 41, decision 1).
/// polite-no: under the level the person set for not being asked, the agent
/// says no with the door open instead of asking (view 41, decision 3).
export type LimitKind = 'no-way' | 'price-below-floor' | 'time' | 'polite-no';

export type LimitDecision =
  | { act: true }
  | { act: false; kind: LimitKind; suggested: { priceUsdc: string; days: number }; limit: number | null };

const money = (n: number) => String(Number(n.toFixed(2)));

/// How many items the floor and usual price cover: the request's count when
/// the way is priced per item, else one (the whole order).
export function orderSize(seller: { pricesPerItem?: boolean }, job: { quantity?: { count: number } | null }): number {
  return seller.pricesPerItem && job.quantity && job.quantity.count > 1 ? job.quantity.count : 1;
}

export function limitDecision(input: {
  seller: { minBudgetUsdc: number; minDeadlineDays: number; maxDeadlineDays: number; pricesPerItem?: boolean; noAskBelowUsdc?: number };
  job: { budgetUsdc: string; deadlineUnix: number; quantity?: { count: number; unit: string | null } | null };
  nowUnix: number;
  /// False when the request is of a kind the person has no way to deal for.
  hasWay: boolean;
}): LimitDecision {
  const { seller } = input;
  const budget = Number(input.job.budgetUsdc);
  const days = Math.max(1, Math.ceil((input.job.deadlineUnix - input.nowUnix) / 86_400));
  if (!input.hasWay) return { act: false, kind: 'no-way', suggested: { priceUsdc: money(budget), days }, limit: null };
  // A goods way priced per item against a request that names a count: the
  // floor for the order is the floor times the count (view 41).
  const floor = seller.minBudgetUsdc * orderSize(seller, input.job);
  const noAsk = (seller.noAskBelowUsdc ?? 0) * orderSize(seller, input.job);
  if (noAsk > 0 && budget < noAsk) {
    return { act: false, kind: 'polite-no', suggested: { priceUsdc: money(floor), days }, limit: Number(noAsk.toFixed(2)) };
  }
  if (budget < floor) {
    return { act: false, kind: 'price-below-floor', suggested: { priceUsdc: money(floor), days }, limit: Number(floor.toFixed(2)) };
  }
  if (days < seller.minDeadlineDays) {
    return { act: false, kind: 'time', suggested: { priceUsdc: money(budget), days: seller.minDeadlineDays }, limit: seller.minDeadlineDays };
  }
  if (days > seller.maxDeadlineDays) {
    return { act: false, kind: 'time', suggested: { priceUsdc: money(budget), days: seller.maxDeadlineDays }, limit: seller.maxDeadlineDays };
  }
  return { act: true };
}
