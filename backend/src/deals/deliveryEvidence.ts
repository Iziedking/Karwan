/// Has this deal been delivered against something a buyer could check?
///
/// Invoice factoring is an advance against a delivery that has happened, so it
/// asks for evidence the delivery is real. It used to ask for one specific
/// shape of evidence:
///
///   if (!deal.acceptedAt || !deal.delivered || !deal.deliveryProof || ...)
///
/// and `deliveryProof` is the SERVICES shape: a link to the work. A goods deal
/// never has one. Marking a goods deal delivered requires a `shipment` instead
/// (carrier plus tracking number, validated against the carrier's format) and
/// the delivery route explicitly skips the link for it: "goods deliver against
/// a proof-of-delivery, not a described deliverable".
///
/// So the check excluded exactly the deals factoring exists for. A supplier who
/// had shipped a container and was waiting on release could not ask for early
/// payout, the request route would have refused, and the deal never reached the
/// financier desk. The rule is the same idea, asked per trade type.

import { tradeTypeOf, type TradeType } from './tradeVocabulary.js';

/// The parts of a deal this rule reads. Deliberately narrow so both the request
/// route and the marketplace filter can pass their own record shape.
export interface DeliveredDeal {
  delivered?: boolean | undefined;
  deliveryProof?: string | null | undefined;
  shipment?: { trackingNumber?: string | null } | null | undefined;
  tradeType?: TradeType | null | undefined;
}

/// The evidence a given trade type delivers against.
export function evidenceKindFor(trade: TradeType): 'link' | 'shipment' | 'either' {
  if (trade === 'goods') return 'shipment';
  if (trade === 'mixed') return 'either';
  return 'link';
}

export function hasDeliveryEvidence(deal: DeliveredDeal): boolean {
  if (!deal.delivered) return false;
  const link = !!deal.deliveryProof?.trim();
  const shipped = !!deal.shipment?.trackingNumber?.trim();
  switch (evidenceKindFor(tradeTypeOf(deal))) {
    case 'shipment':
      return shipped;
    // A mixed deal is required to supply both at delivery, so either one
    // present is evidence. Accepting either also keeps mixed deals delivered
    // before the shipment requirement landed from silently losing factoring.
    case 'either':
      return link || shipped;
    default:
      return link;
  }
}

/// Is this deal at the point where an advance against the invoice makes sense?
///
/// Delivery has happened and the buyer has not released yet. Everything else
/// about factoring eligibility (who is asking, whether a line already exists)
/// belongs to the caller.
export function isFactorable(
  deal: DeliveredDeal & {
    acceptedAt?: number | null | undefined;
    settledAt?: number | null | undefined;
    cancelledAt?: number | null | undefined;
    disputed?: boolean | undefined;
  },
): boolean {
  return (
    !!deal.acceptedAt &&
    hasDeliveryEvidence(deal) &&
    !deal.settledAt &&
    !deal.cancelledAt &&
    !deal.disputed
  );
}
