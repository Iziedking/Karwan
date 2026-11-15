import { formatUnits, parseUnits } from 'viem';

/// A buyer can ask the seller to back a deal with a share of its value: a deal
/// guarantee, which comes only from the seller's savings pocket (view 82). The
/// seller backs it before the buyer pays in; the escrow then reserves it when
/// the deal is accepted.

export const DEFAULT_GUARANTEE_PCT = 50;

export function guaranteeMicros(amountMicros: bigint, pct: number): bigint {
  return (amountMicros * BigInt(pct)) / 100n;
}

export interface GuaranteeAsk {
  dealAmountUsdc: string;
  requireStake?: boolean;
  requireStakePct?: number;
  guaranteeBackedAt?: number;
}

export type GuaranteeState =
  | { state: 'none' }
  | { state: 'asked'; needMicros: bigint }
  | { state: 'short'; needMicros: bigint; missingMicros: bigint }
  | { state: 'backed'; needMicros: bigint };

export function guaranteeNeedOf(deal: GuaranteeAsk): bigint {
  return guaranteeMicros(parseUnits(deal.dealAmountUsdc, 6), deal.requireStakePct ?? DEFAULT_GUARANTEE_PCT);
}

/// Where the seller stands on the ask, given what is free in their pocket now.
export function guaranteeState(deal: GuaranteeAsk, freeMicros: bigint): GuaranteeState {
  if (!deal.requireStake) return { state: 'none' };
  const needMicros = guaranteeNeedOf(deal);
  if (deal.guaranteeBackedAt) return { state: 'backed', needMicros };
  if (freeMicros < needMicros) return { state: 'short', needMicros, missingMicros: needMicros - freeMicros };
  return { state: 'asked', needMicros };
}

export interface BackingRefusal {
  code: 'GUARANTEE_NOT_CONFIRMED' | 'GUARANTEE_SHORT';
  error: string;
  missingUsdc?: string;
}

/// Whether the seller may agree to a deal: with an ask, only by backing it
/// (the seller says so) and only when the pocket's free part covers it.
export function backingRefusal(deal: GuaranteeAsk, confirmed: boolean, freeMicros: bigint): BackingRefusal | null {
  const s = guaranteeState({ ...deal, guaranteeBackedAt: undefined }, freeMicros);
  if (s.state === 'none') return null;
  if (!confirmed) return { code: 'GUARANTEE_NOT_CONFIRMED', error: 'This deal asks you to back a deal guarantee from your savings pocket. Confirm it to agree.' };
  if (s.state === 'short') {
    const missingUsdc = formatUnits(s.missingMicros, 6);
    return { code: 'GUARANTEE_SHORT', error: `Add ${missingUsdc} USDC to your savings pocket to back this deal.`, missingUsdc };
  }
  return null;
}
