/// A seller can mark delivery straight on the escrow, from their own wallet,
/// without going through Karwan. The contract then starts the buyer's review
/// clock, and when it runs out the seller can claim. If we only learn about
/// deliveries through our own route, the buyer never hears the clock started.
///
/// This decides when the chain knows about a delivery we don't, so the watcher
/// can tell the buyer. It never marks the deal delivered: an out-of-band mark
/// carries no evidence we checked, so nothing downstream should treat it as a
/// delivery we vouch for.

export interface OnChainDeliveryState {
  delivered?: boolean;
  onChainDeliveryAlertedAt?: number;
}

export interface OnChainDeliveryAccount {
  deliveredAt?: bigint;
  claimDeadline?: bigint;
}

export interface OnChainDeliveryAlert {
  deliveredAtMs: number;
  claimableAtMs: number;
}

export function onChainDeliveryAlert(
  deal: OnChainDeliveryState,
  account: OnChainDeliveryAccount,
): OnChainDeliveryAlert | null {
  if (deal.delivered) return null;
  const deliveredAtMs = Number(account.deliveredAt ?? 0n) * 1000;
  if (deliveredAtMs <= 0) return null;
  if (deal.onChainDeliveryAlertedAt === deliveredAtMs) return null;
  return { deliveredAtMs, claimableAtMs: Number(account.claimDeadline ?? 0n) * 1000 };
}
