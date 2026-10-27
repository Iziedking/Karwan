/// The honest note when a budget is far under what the work goes for (view 35,
/// decision 6). The agent never haggles sellers below their own floor to reach
/// such a budget; it tells the buyer instead, once, and leaves the choice to
/// them: allow more, or post again at a higher budget.

/// How far under a grounded fair price a budget has to sit before the buyer is
/// told: under 60% of it.
export const MARKET_UNDERPRICED_ALERT_PCT = 40;

/// Two seller sweeps (10 minutes each), so every seller had the chance to offer.
export const UNDER_MARKET_CHECK_MS = 20 * 60_000;

export function isFarUnderMarket(budgetUsdc: number, fairPriceUsdc: number | undefined): boolean {
  if (!fairPriceUsdc || fairPriceUsdc <= 0 || !(budgetUsdc > 0)) return false;
  return budgetUsdc < fairPriceUsdc * (1 - MARKET_UNDERPRICED_ALERT_PCT / 100);
}

export function underMarketNoteDue(s: { farUnder: boolean; offerWithinCap: boolean; noted: boolean }): boolean {
  return s.farUnder && !s.offerWithinCap && !s.noted;
}
