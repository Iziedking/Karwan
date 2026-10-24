/// Events that already tell the person about the USDC transfer in their own
/// transaction: a deposit landing on Arc, a deal payment, a refund. The balance
/// watcher sees the same transfer on chain a little later and stays quiet about
/// it, so one deposit or payment is one notice.
const ANNOUNCING = new Set([
  'bridge.minted',
  'escrow.milestone.released',
  'escrow.seller.paid',
  'escrow.released_from_dispute',
  'escrow.resolved',
  'escrow.refunded',
  'escrow.reclaimed',
  'escrow.split',
  'escrow.owed.withdrawn',
]);

export function createAnnouncedTransfers(limit = 2_000) {
  const seen = new Set<string>();
  return {
    note(event: { type: string; payload?: Record<string, unknown> }): void {
      const tx = event.payload?.txHash;
      if (!ANNOUNCING.has(event.type) || typeof tx !== 'string' || !tx) return;
      seen.add(tx.toLowerCase());
      if (seen.size > limit) seen.delete(seen.values().next().value!);
    },
    has(txHash: string): boolean {
      return seen.has(txHash.toLowerCase());
    },
  };
}
