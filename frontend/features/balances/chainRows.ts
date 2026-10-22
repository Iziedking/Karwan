/// Money in the instant top-up balance is wallet money spendable on Arc, so
/// the Arc line on your own wallet includes it, the same as the summary above.
export function arcIncludingPool(arc: number | null, pool: number): number | null {
  if (arc === null) return null;
  return Math.round((arc + pool) * 1e6) / 1e6;
}

/// The one line every wallet tab shows in place of its chain list.
export function chainsSummaryLabel(
  funded: number,
  total: number,
  copy: { zeroChainsTemplate: string; fundedChainsTemplate: string; fundedChainOne: string },
): string {
  if (funded === 0) return copy.zeroChainsTemplate.replace('{n}', String(total));
  return (funded === 1 ? copy.fundedChainOne : copy.fundedChainsTemplate).replace('{n}', String(funded)).replace('{total}', String(total));
}
