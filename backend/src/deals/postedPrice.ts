import { formatUnits } from 'viem';

/// A request posted to the market carries the buyer's budget in its signed
/// text, and an accepted offer can change the price before the escrow is
/// funded. The signed text and its hash stay as they were; the deal page shows
/// the price that was posted next to the one the escrow holds. Null when they
/// are the same or the posted budget is unknown.
export function postedPriceUsdc(dealAmountUsdc: string, postedBudgetMicros: string | null | undefined): string | null {
  if (!postedBudgetMicros || !/^\d+$/.test(postedBudgetMicros) || postedBudgetMicros === '0') return null;
  const posted = formatUnits(BigInt(postedBudgetMicros), 6);
  return Number(posted) === Number(dealAmountUsdc) ? null : posted;
}
