/// The release leg of a milestone payout. It names the address the escrow pays
/// (the payee in the stored escrow terms), so the balance watcher matches the
/// arrival to this payout instead of recording it again as a deposit.
export function releaseLeg(
  deal: { buyerAgentWalletId?: string; escrowTerms?: { seller?: string } },
  escrowAddress: string,
  milestoneIndex: number,
  amountMicros: bigint,
) {
  return {
    key: 'release',
    label: `Pay milestone ${milestoneIndex + 1}`,
    rail: 'circle_wallets' as const,
    walletId: deal.buyerAgentWalletId,
    sourceAddress: escrowAddress,
    destinationAddress: deal.escrowTerms?.seller,
    contractAddress: escrowAddress,
    amountMicros,
  };
}
