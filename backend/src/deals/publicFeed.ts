/// The public feed of settled deals: a value band and a time per deal. A field
/// reaches the public only by being named here.

export type AmountBand = 'under_100' | '100_500' | '500_2000' | '2000_10000' | 'over_10000';

export type DealOrigin = 'agent' | 'direct';

/// What the public may know about a settled deal: roughly how large, when, and
/// whether an agent found the match. No parties, no deal id, no exact amount.
export interface PublicFeedDeal {
  amountBand: AmountBand;
  settledAt: number;
  origin: DealOrigin;
}

export interface PublicFeedSource {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  createdAt: number;
  acceptedAt?: number;
  settledAt?: number;
  cancelledAt?: number;
  updatedAt: number;
  onChain?: { state: number } | null;
}

export function maskAddress(addr: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function amountBand(usdc: string): AmountBand {
  const n = Number(usdc);
  if (!Number.isFinite(n) || n < 100) return 'under_100';
  if (n < 500) return '100_500';
  if (n < 2000) return '500_2000';
  if (n < 10000) return '2000_10000';
  return 'over_10000';
}

/// New rows say how they began; older ones fall back to the brief store, since
/// every agent deal has a brief and a direct deal never does.
export function dealOrigin(deal: { origin?: DealOrigin }, hasBrief: boolean): DealOrigin {
  return deal.origin ?? (hasBrief ? 'agent' : 'direct');
}

export function publicFeedDeal(deal: PublicFeedSource, origin: DealOrigin): PublicFeedDeal {
  return { amountBand: amountBand(deal.dealAmountUsdc), settledAt: deal.settledAt ?? deal.updatedAt, origin };
}
