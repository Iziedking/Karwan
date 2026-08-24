/// When each of the two financing products is offerable on a deal.
///
/// They are different moments in the same trade, and they never overlap:
///
///   PO financing   capital the seller needs to FULFIL the order. Offerable
///                  once escrow is funded and until delivery is marked.
///   Invoice factoring   an advance against a delivery that has HAPPENED, while
///                  the seller waits on the buyer to release. Offerable from
///                  delivery until settlement.
///
/// Both are trade-finance (B2B) products and neither appears on a P2P service
/// deal. Extracted from the banner so the rules are checkable: they were four
/// inline boolean chains, one of which measured delivery by `deliveryProof` and
/// so could never be true for a goods deal. See deliveryEvidence.ts.

import { hasDeliveryEvidence, type DeliveredDeal } from './deliveryEvidence';

export interface FinancingDeal extends DeliveredDeal {
  tradeLane?: 'service' | 'finance' | null;
  acceptedAt?: number | null;
  settledAt?: number | null;
  cancelledAt?: number | null;
  disputed?: boolean;
  poFinancingId?: string | null;
  poFinancingRequestedAt?: number | null;
  factoringOfferId?: string | null;
  factoringRequestedAt?: number | null;
}

/// True for a live trade-finance deal the viewer sells on. Financing is private
/// to the seller: the buyer must never see a request or a funded position.
export function financingVisible(deal: FinancingDeal, viewerIsSeller: boolean): boolean {
  return (
    viewerIsSeller &&
    deal.tradeLane === 'finance' &&
    !!deal.acceptedAt &&
    !deal.settledAt &&
    !deal.cancelledAt &&
    !deal.disputed
  );
}

/// Capital to fulfil the order. Closes the moment delivery is marked, because
/// after that the money owed is an invoice, and an invoice is factored.
export function poFinancingOfferable(deal: FinancingDeal, viewerIsSeller: boolean): boolean {
  return (
    financingVisible(deal, viewerIsSeller) &&
    !deal.delivered &&
    !deal.poFinancingId &&
    !deal.factoringRequestedAt &&
    !deal.factoringOfferId
  );
}

/// An advance against a delivered invoice. Opens exactly where PO closes.
export function factoringOfferable(deal: FinancingDeal, viewerIsSeller: boolean): boolean {
  return (
    financingVisible(deal, viewerIsSeller) &&
    hasDeliveryEvidence(deal) &&
    !deal.poFinancingRequestedAt &&
    !deal.poFinancingId &&
    !deal.factoringOfferId
  );
}
