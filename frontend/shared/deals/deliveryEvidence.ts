/// Has this deal been delivered against something a buyer could check?
///
/// Mirror of `backend/src/deals/deliveryEvidence.ts`. The banner decides
/// whether to offer early payout, and the request route decides whether to
/// accept it, so the two have to agree: a card that appears and then 409s is
/// worse than no card.
///
/// The bug both sides shared: factoring asked for `deliveryProof`, which is the
/// SERVICES shape of evidence. A goods deal delivers a `shipment` (carrier and
/// tracking number) and never has a link, so the one product built for
/// suppliers shipping goods was invisible to exactly them.

import { tradeTypeOf, type TradeType } from './tradeVocabulary';

export interface DeliveredDeal {
  delivered?: boolean;
  deliveryProof?: string | null;
  shipment?: { trackingNumber?: string | null } | null;
  tradeType?: TradeType | null;
}

export function evidenceKindFor(trade: TradeType): 'link' | 'shipment' | 'either' {
  if (trade === 'goods') return 'shipment';
  if (trade === 'mixed') return 'either';
  return 'link';
}

export function hasDeliveryEvidence(deal: DeliveredDeal): boolean {
  if (!deal.delivered) return false;
  const link = !!deal.deliveryProof?.trim();
  const shipped = !!deal.shipment?.trackingNumber?.trim();
  switch (evidenceKindFor(tradeTypeOf(deal.tradeType))) {
    case 'shipment':
      return shipped;
    case 'either':
      return link || shipped;
    default:
      return link;
  }
}
