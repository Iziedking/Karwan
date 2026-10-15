/// Money in the instant top-up balance is wallet money spendable on Arc, so
/// the Arc line on your own wallet includes it, the same as the summary above.
export function arcIncludingPool(arc: number | null, pool: number): number | null {
  if (arc === null) return null;
  return Math.round((arc + pool) * 1e6) / 1e6;
}

export function emptyChainsLabel(
  count: number,
  othersListed: boolean,
  copy: { zeroChainsTemplate: string; zeroOtherChainsTemplate: string; zeroChainOne: string; zeroOtherChainOne: string },
): string {
  if (count === 1) return othersListed ? copy.zeroOtherChainOne : copy.zeroChainOne;
  return (othersListed ? copy.zeroOtherChainsTemplate : copy.zeroChainsTemplate).replace('{n}', String(count));
}
