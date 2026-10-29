/// Whether the selling agent acts on a request that fits, or asks its person
/// first (view 41). Limits never make the agent go quiet: inside them it
/// offers, outside them it asks with a suggested answer the person can take,
/// change or turn down. Fit is decided before this is called.

/// There is no price-above-usual: a budget above the usual price is an offer,
/// opened from the usual price (view 41, decision 1).
export type LimitKind = 'no-way' | 'price-below-floor' | 'time';

export type LimitDecision =
  | { act: true }
  | { act: false; kind: LimitKind; suggested: { priceUsdc: string; days: number }; limit: number | null };

const money = (n: number) => String(Number(n.toFixed(2)));

export function limitDecision(input: {
  seller: { minBudgetUsdc: number; minDeadlineDays: number; maxDeadlineDays: number };
  job: { budgetUsdc: string; deadlineUnix: number };
  nowUnix: number;
  /// False when the request is of a kind the person has no way to deal for.
  hasWay: boolean;
}): LimitDecision {
  const { seller } = input;
  const budget = Number(input.job.budgetUsdc);
  const days = Math.max(1, Math.ceil((input.job.deadlineUnix - input.nowUnix) / 86_400));
  if (!input.hasWay) return { act: false, kind: 'no-way', suggested: { priceUsdc: money(budget), days }, limit: null };
  if (budget < seller.minBudgetUsdc) {
    return { act: false, kind: 'price-below-floor', suggested: { priceUsdc: money(seller.minBudgetUsdc), days }, limit: seller.minBudgetUsdc };
  }
  if (days < seller.minDeadlineDays) {
    return { act: false, kind: 'time', suggested: { priceUsdc: money(budget), days: seller.minDeadlineDays }, limit: seller.minDeadlineDays };
  }
  if (days > seller.maxDeadlineDays) {
    return { act: false, kind: 'time', suggested: { priceUsdc: money(budget), days: seller.maxDeadlineDays }, limit: seller.maxDeadlineDays };
  }
  return { act: true };
}
