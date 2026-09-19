/// The public feed of settled deals, as an allowlist.
///
/// It used to be the full enriched deal with the addresses masked, which
/// published internal wallet ids, the agreed terms, company names, document
/// references and the buyer's private assessment of the delivery to anyone.
/// A field reaches the public only by being named here.

export interface PublicFeedDeal {
  jobId: string;
  buyer: string;
  seller: string;
  dealAmountUsdc: string;
  createdAt: number;
  acceptedAt?: number;
  settledAt?: number;
  cancelledAt?: number;
  updatedAt: number;
  onChain: { state: number } | null;
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

export function publicFeedDeal(deal: PublicFeedSource): PublicFeedDeal {
  return {
    jobId: deal.jobId,
    buyer: maskAddress(deal.buyer),
    seller: maskAddress(deal.seller),
    dealAmountUsdc: deal.dealAmountUsdc,
    createdAt: deal.createdAt,
    ...(deal.acceptedAt != null ? { acceptedAt: deal.acceptedAt } : {}),
    ...(deal.settledAt != null ? { settledAt: deal.settledAt } : {}),
    ...(deal.cancelledAt != null ? { cancelledAt: deal.cancelledAt } : {}),
    updatedAt: deal.updatedAt,
    onChain: deal.onChain ? { state: deal.onChain.state } : null,
  };
}
