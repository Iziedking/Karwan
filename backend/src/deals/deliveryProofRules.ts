import { keccak256, toBytes, type Hex } from 'viem';

/// What a delivery has to carry, from how the deal reaches the buyer (views 33
/// and 85). Shipped goods name a carrier with a tracking number; work done or
/// goods handed over in person end in the buyer's handover code; work sent
/// online delivers a link. Goods worth more than PHOTO_REQUIRED_ABOVE_USDC also carry a photo of
/// the item (owner, 26 Oct 2026).
export const PHOTO_REQUIRED_ABOVE_USDC = 50;
export const MAX_DELIVERY_PHOTOS = 4;

/// How a deal reaches the buyer (view 85): sent online, done or handed over in
/// person, or shipped by a carrier. Older deals have no method and read it from
/// their trade type and, for goods, how they were to reach the buyer.
export type DeliveryMethod = 'online' | 'in_person' | 'shipped';
export const DELIVERY_METHODS = ['online', 'in_person', 'shipped'] as const;

export function deliveryMethodOf(deal: {
  deliveryMethod?: DeliveryMethod;
  tradeType?: 'service' | 'goods' | 'mixed' | null;
  goodsWay?: 'shipped' | 'in_person' | null;
}): DeliveryMethod {
  if (deal.deliveryMethod) return deal.deliveryMethod;
  if (deal.tradeType !== 'goods' && deal.tradeType !== 'mixed') return 'online';
  return deal.goodsWay === 'in_person' ? 'in_person' : 'shipped';
}

/// A request's delivery kind as the method of the deal made from it.
export function methodFromKind(kind: 'goods' | 'in_person' | 'remote'): DeliveryMethod {
  return kind === 'goods' ? 'shipped' : kind === 'in_person' ? 'in_person' : 'online';
}

export interface DeliveryNeeds {
  method: DeliveryMethod;
  /// Something physical changes hands: a shipment, or a handover code.
  goods: boolean;
  link: boolean;
  photo: boolean;
  /// Only the buyer's handover code marks it delivered (in person).
  handover: boolean;
}

export function deliveryNeeds(deal: {
  deliveryMethod?: DeliveryMethod;
  tradeType?: 'service' | 'goods' | 'mixed';
  goodsWay?: 'shipped' | 'in_person';
  dealAmountUsdc: string;
}): DeliveryNeeds {
  const method = deliveryMethodOf(deal);
  const goods = method !== 'online';
  return {
    method,
    goods,
    link: method === 'online' || (method === 'shipped' && deal.tradeType === 'mixed'),
    photo: goods && Number(deal.dealAmountUsdc) > PHOTO_REQUIRED_ABOVE_USDC,
    handover: method === 'in_person',
  };
}

/// The fingerprint of the whole delivery, written on chain with it: the note,
/// the shipment or handover and each photo's own fingerprint. A dispute can
/// then show that what the buyer saw is what was delivered.
export function deliveryFingerprint(input: {
  deliveryProof?: string | null;
  shipment?: { carrier: string; trackingNumber: string; trackingUrl: string | null } | null;
  photoHashes?: Hex[];
  handedOverAt?: number | null;
}): Hex {
  return keccak256(
    toBytes(
      JSON.stringify({
        deliveryProof: input.deliveryProof ?? null,
        shipment: input.shipment
          ? { carrier: input.shipment.carrier, trackingNumber: input.shipment.trackingNumber, trackingUrl: input.shipment.trackingUrl }
          : null,
        photos: input.photoHashes ?? [],
        handedOverAt: input.handedOverAt ?? null,
      }),
    ),
  );
}

export const photoFingerprint = (bytes: Uint8Array): Hex => keccak256(bytes);
