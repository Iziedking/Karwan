import type { DirectDeal } from '../db/deals.js';

export interface LifecycleTiming {
  /// Seller agreement minus deal creation, when both timestamps are present.
  sellerResponseMs: number | null;
  /// Delivery minus escrow funding, measuring seller completion after the deal
  /// became active.
  sellerCompletionMs: number | null;
  /// Buyer verification minus delivery, recorded at arrival or first release.
  buyerVerificationMs: number | null;
  /// Final settlement minus delivery, the complete buyer release path.
  buyerReleaseMs: number | null;
  samples: {
    sellerResponse: number;
    sellerCompletion: number;
    buyerVerification: number;
    buyerRelease: number;
  };
}

function average(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function positiveDelta(end: number | undefined, start: number | undefined): number | null {
  if (end == null || start == null) return null;
  const delta = end - start;
  return delta >= 0 ? delta : null;
}

/// Derives operational timing from persisted lifecycle timestamps. It never
/// treats a submission or a tx hash as completion: delivery and settlement
/// timestamps are written only by their corresponding verified state paths.
export function lifecycleTimingForParty(deals: DirectDeal[], address: string): LifecycleTiming {
  const subject = address.toLowerCase();
  const sellerResponse: number[] = [];
  const sellerCompletion: number[] = [];
  const buyerVerification: number[] = [];
  const buyerRelease: number[] = [];
  for (const deal of deals) {
    if (deal.seller.toLowerCase() === subject) {
      const response = positiveDelta(deal.sellerApprovedAt, deal.createdAt);
      if (response != null) sellerResponse.push(response);
      const completion = positiveDelta(deal.deliveredAt, deal.acceptedAt);
      if (completion != null) sellerCompletion.push(completion);
    }
    if (deal.buyer.toLowerCase() === subject) {
      const verification = positiveDelta(deal.buyerVerifiedAt ?? deal.reviewWindowStartedAt, deal.deliveredAt);
      if (verification != null) buyerVerification.push(verification);
      const release = positiveDelta(deal.settledAt, deal.deliveredAt);
      if (release != null) buyerRelease.push(release);
    }
  }
  return {
    sellerResponseMs: average(sellerResponse),
    sellerCompletionMs: average(sellerCompletion),
    buyerVerificationMs: average(buyerVerification),
    buyerReleaseMs: average(buyerRelease),
    samples: {
      sellerResponse: sellerResponse.length,
      sellerCompletion: sellerCompletion.length,
      buyerVerification: buyerVerification.length,
      buyerRelease: buyerRelease.length,
    },
  };
}
