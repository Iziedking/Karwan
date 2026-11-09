import type { BudgetRange } from './budgetRange.js';

/// The buyer agent's first counter on an offer (view 73, spec S5), the way a
/// person would answer: the public price for a posted offer under the budget,
/// 85 percent of the budget for an offer over it, and for a profile offer the
/// most of half the market price, the range's low end and 80 percent of the
/// opening. Never above the budget, never above the seller's opening.

export interface BuyerOpeningInput {
  sellerOpeningUsdc: number;
  postedUsdc: number | null;
  marketUsdc: number | null;
  range: BudgetRange | null;
  budgetUsdc: number;
  overBudget: boolean;
}

const money = (n: number) => Number(n.toFixed(2));

export function buyerOpeningCounter(i: BuyerOpeningInput): number {
  const halfMarket = i.marketUsdc !== null && i.marketUsdc > 0 ? i.marketUsdc * 0.5 : 0;
  let counter: number;
  if (i.overBudget) counter = Math.max(halfMarket, 0.85 * i.budgetUsdc);
  else if (i.postedUsdc !== null && i.postedUsdc > 0) counter = i.postedUsdc;
  else counter = Math.max(halfMarket, i.range?.lowUsdc ?? 0, 0.8 * i.sellerOpeningUsdc);
  if (i.budgetUsdc > 0) counter = Math.min(counter, i.budgetUsdc);
  return money(Math.min(counter, i.sellerOpeningUsdc));
}
