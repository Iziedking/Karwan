import type { Ladder } from '../verification/ladder.js';

/// The escrow on mainnet is a capped beta. These limits mirror the contract's
/// own cap, so a deal is refused in chat before anything is signed.
export const BETA_DEAL_CAP_USDC = 1_000;
export const ID_CHECK_FROM_USDC = 100;

export type ChatDealGate =
  | { ok: true }
  | { ok: false; reason: 'not_verified' | 'needs_id' | 'over_cap'; message: string };

export function chatDealGate(input: { amountUsdc: number; buyer: Ladder; seller: Ladder }): ChatDealGate {
  if (input.amountUsdc > BETA_DEAL_CAP_USDC) {
    return {
      ok: false,
      reason: 'over_cap',
      message: `Escrow on Arc mainnet is in beta, up to ${BETA_DEAL_CAP_USDC.toLocaleString('en')} USDC per deal. Split it into smaller milestones or deals.`,
    };
  }
  if (input.buyer === 'registered') {
    return { ok: false, reason: 'not_verified', message: 'Verify yourself with the person check before you pay into escrow.' };
  }
  if (input.amountUsdc >= ID_CHECK_FROM_USDC && (input.buyer !== 'id_verified' || input.seller !== 'id_verified')) {
    return {
      ok: false,
      reason: 'needs_id',
      message: `Deals of ${ID_CHECK_FROM_USDC} USDC and above need an ID check from both sides first.`,
    };
  }
  return { ok: true };
}
