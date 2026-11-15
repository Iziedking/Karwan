/// A buyer can ask the seller to back a deal with a share of its value: a deal
/// guarantee. It comes only from the seller's savings pocket, and the seller
/// backs it when they agree (view 82).

export const GUARANTEE_SHARES = [50, 75, 100] as const;
const DEFAULT_SHARE = 50;

export function guaranteeUsdc(amountUsdc: number, pct: number): number {
  return Math.round(amountUsdc * pct * 10_000) / 1_000_000;
}

export interface GuaranteeTerm {
  usdc: number;
  pct: number;
  /// The seller backed it; once paid in, the escrow holds it reserved.
  backed: boolean;
}

export function guaranteeTerm(deal: {
  dealAmountUsdc: string;
  requireStake?: boolean;
  requireStakePct?: number;
  guaranteeBackedAt?: number;
  acceptedAt?: number;
}): GuaranteeTerm | null {
  if (!deal.requireStake) return null;
  const pct = deal.requireStakePct ?? DEFAULT_SHARE;
  return { usdc: guaranteeUsdc(Number(deal.dealAmountUsdc), pct), pct, backed: !!deal.guaranteeBackedAt || !!deal.acceptedAt };
}
