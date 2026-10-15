import type { AmountBand } from '@/core/api';

interface LifetimeSlice {
  network?: { testnet: boolean };
  totals: { deals: number };
  volumes: { fundedUsdc: string; releasedUsdc: string; refundedUsdc: string };
  scannedAt: number;
}

export interface SettlementFigures {
  deals: number;
  fundedUsdc: number;
  releasedUsdc: number;
  returnedUsdc: number;
  /// Whole percent of the USDC funded into escrow, rounded down so the two
  /// never claim more than was funded.
  releasedShare: number;
  returnedShare: number;
  testnet: boolean;
  scannedAt: number;
}

/// The all-time record read from the contracts, or null when there is nothing
/// real to show yet; the landing then shows the example sequence instead.
export function settlementFigures(stats: LifetimeSlice | null | undefined): SettlementFigures | null {
  if (!stats || !(stats.totals.deals > 0)) return null;
  const funded = Number(stats.volumes.fundedUsdc);
  const released = Number(stats.volumes.releasedUsdc);
  const returned = Number(stats.volumes.refundedUsdc);
  if (![funded, released, returned].every(Number.isFinite) || funded <= 0) return null;
  const releasedShare = Math.min(100, Math.floor((released / funded) * 100));
  const returnedShare = Math.min(100 - releasedShare, Math.floor((returned / funded) * 100));
  return {
    deals: stats.totals.deals,
    fundedUsdc: funded,
    releasedUsdc: released,
    returnedUsdc: returned,
    releasedShare,
    returnedShare,
    testnet: stats.network?.testnet ?? true,
    scannedAt: stats.scannedAt,
  };
}

export function latestSettled<T extends { amountBand: AmountBand; settledAt: number }>(feed: T[] | undefined, count = 5): T[] {
  return [...(feed ?? [])].sort((a, b) => b.settledAt - a.settledAt).slice(0, count);
}
