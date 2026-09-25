import type { DirectDeal, DirectDealOnChainV3 } from '@/core/api';

/// What the v3 panel shows for this viewer right now. Pure, so every branch is
/// tested without rendering.

/// The deal-page escrow state numbers (v2 numbering; a v3 deal is mapped onto
/// them by the backend).
const FUNDED = 1;
const DISPUTED = 4;

export type V3PanelState =
  | { kind: 'none' }
  | { kind: 'unaccepted'; viewer: 'buyer' | 'seller'; refundUsdc: string }
  | { kind: 'ruling'; viewer: 'buyer' | 'seller'; ruling: NonNullable<DirectDealOnChainV3['ruling']>; canAct: boolean }
  | { kind: 'waiting'; viewer: 'buyer' | 'seller'; escalateOpensAtMs: number | null; canAct: boolean }
  | { kind: 'review'; viewer: 'buyer' | 'seller'; lapseAtMs: number | null };

function usdc(micros: bigint): string {
  const whole = micros / 1_000_000n;
  const frac = (micros % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole.toLocaleString('en-US')}.${frac}` : whole.toLocaleString('en-US');
}

export function v3PanelState(
  deal: Pick<DirectDeal, 'buyer' | 'seller' | 'onChain' | 'cancelledAt' | 'settledAt'>,
  address: string | null,
  nowMs: number,
): V3PanelState {
  const chain = deal.onChain;
  const v3 = chain?.v3;
  if (!chain || chain.escrowVersion !== 'v3' || !v3 || deal.cancelledAt || deal.settledAt) return { kind: 'none' };
  const who = address?.toLowerCase();
  const viewer = who === deal.buyer.toLowerCase() ? 'buyer' : who === deal.seller.toLowerCase() ? 'seller' : null;
  if (!viewer) return { kind: 'none' };

  if (!v3.accepted && chain.state === FUNDED) {
    const refund = BigInt(chain.sellerNetWei) - BigInt(chain.releasedWei) + BigInt(chain.feeTotalWei);
    return { kind: 'unaccepted', viewer, refundUsdc: usdc(refund) };
  }
  if (chain.state !== DISPUTED) return { kind: 'none' };
  if (v3.escalated) return { kind: 'review', viewer, lapseAtMs: v3.lapseAtMs ?? null };
  if (v3.ruling) {
    const open = v3.ruling.appealEndsAtMs !== null && nowMs < v3.ruling.appealEndsAtMs;
    return { kind: 'ruling', viewer, ruling: v3.ruling, canAct: open };
  }
  const opensAt = v3.escalateOpensAtMs ?? null;
  return { kind: 'waiting', viewer, escalateOpensAtMs: opensAt, canAct: opensAt !== null && nowMs >= opensAt };
}
