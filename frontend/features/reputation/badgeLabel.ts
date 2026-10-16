export interface DealCountCopy {
  dealCountOneTemplate: string;
  dealCountManyTemplate: string;
}

/// "12 deals", or null when the reply carried no count to word.
export function dealCountLine(count: number | null | undefined, copy: DealCountCopy): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null;
  return (count === 1 ? copy.dealCountOneTemplate : copy.dealCountManyTemplate).replace('{count}', String(count));
}

/// What a screen reader hears for the badge: the tier, then the deal count when known.
export function badgeAccessibleLabel(tier: string, count: number | null | undefined, copy: DealCountCopy): string {
  const line = dealCountLine(count, copy);
  return line ? `${tier}. ${line}` : tier;
}
