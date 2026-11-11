type Figure = { currency: string; amount: string };

/// The figure a deal's amount reads as for one person (view 77). The price as
/// agreed comes first, for anyone reading in the currency it was agreed in.
/// Once the deal has settled, the other side reads what it was worth to them
/// that day, so a finished deal does not change with the rate.
export function dealFigure(
  deal: { agreedLocal?: Figure; settledAt?: number | null; settledWorth?: Record<string, Figure> },
  me: string | null | undefined,
  currency: string,
): Figure | undefined {
  if (deal.agreedLocal?.currency === currency) return deal.agreedLocal;
  const mine = deal.settledAt && me ? deal.settledWorth?.[me.toLowerCase()] : undefined;
  return mine?.currency === currency ? mine : deal.agreedLocal;
}
