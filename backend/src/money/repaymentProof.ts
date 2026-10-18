export interface EscrowPayout {
  txHash: string;
  value: bigint;
}

/// Which escrow-to-financier payment proves a repayment. One payment of the
/// exact amount is preferred; otherwise the payments are added in order, and
/// the release that brought the total to the amount owed is the proof, which is
/// how a deal paid in several milestones repays its financier.
export function repaymentProof(payouts: readonly EscrowPayout[], amount: bigint): { txHash: string; parts: number } | null {
  const exact = payouts.find((p) => p.value === amount);
  if (exact) return { txHash: exact.txHash, parts: 1 };
  let total = 0n;
  for (const [index, p] of payouts.entries()) {
    total += p.value;
    if (total >= amount) return { txHash: p.txHash, parts: index + 1 };
  }
  return null;
}
