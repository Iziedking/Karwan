export type Shipment = { carrier: string; trackingNumber: string; trackingUrl: string };
type TradeType = 'service' | 'goods' | 'mixed' | undefined;

/// Goods worth more than this are delivered with a photo of the item; the
/// backend holds the same line (deals/deliveryProofRules.ts).
export const PHOTO_REQUIRED_ABOVE_USDC = 50;
export const MAX_DELIVERY_PHOTOS = 4;

export function deliveryNeedsShipment(tradeType: TradeType): boolean {
  return tradeType === 'goods' || tradeType === 'mixed';
}

export function deliveryNeedsPhoto(deal: { tradeType?: TradeType; dealAmountUsdc: string }): boolean {
  return deliveryNeedsShipment(deal.tradeType) && Number(deal.dealAmountUsdc) > PHOTO_REQUIRED_ABOVE_USDC;
}

/// The same bar the backend holds: goods and mixed orders name the carrier and
/// a reference of at least 3 characters, plus an https tracking page when the
/// carrier has none Karwan knows, or end in the buyer's six-digit handover code;
/// a service hands over its proof. Goods over 50 USDC also carry a photo.
export function deliveryReady(input: {
  tradeType: TradeType;
  proof: string;
  shipment: Shipment;
  carrier: { slug: string; needsUrl: boolean } | undefined;
  handoverCode?: string | null;
  photos?: number;
  photoRequired?: boolean;
}): boolean {
  if (input.photoRequired && !input.photos) return false;
  if (!deliveryNeedsShipment(input.tradeType)) return input.proof.trim().length > 0;
  if (input.handoverCode != null) return /^\d{6}$/.test(input.handoverCode.trim());
  const { shipment, carrier } = input;
  if (!carrier || carrier.slug !== shipment.carrier) return false;
  if (shipment.trackingNumber.trim().length < 3) return false;
  return !carrier.needsUrl || /^https:\/\/\S+$/.test(shipment.trackingUrl.trim());
}
