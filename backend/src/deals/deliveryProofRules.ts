import { keccak256, toBytes, type Hex } from 'viem';

/// What a delivery has to carry, from the kind of deal (view 33). Goods name a
/// carrier with a tracking number or end in a handover code; work delivers a
/// link. Goods worth more than PHOTO_REQUIRED_ABOVE_USDC also carry a photo of
/// the item (owner, 26 Oct 2026).
export const PHOTO_REQUIRED_ABOVE_USDC = 50;
export const MAX_DELIVERY_PHOTOS = 4;

export interface DeliveryNeeds {
  goods: boolean;
  link: boolean;
  photo: boolean;
}

export function deliveryNeeds(deal: { tradeType?: 'service' | 'goods' | 'mixed'; dealAmountUsdc: string }): DeliveryNeeds {
  const goods = deal.tradeType === 'goods' || deal.tradeType === 'mixed';
  return {
    goods,
    link: deal.tradeType !== 'goods',
    photo: goods && Number(deal.dealAmountUsdc) > PHOTO_REQUIRED_ABOVE_USDC,
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
