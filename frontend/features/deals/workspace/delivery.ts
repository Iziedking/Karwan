export type Shipment = { carrier: string; trackingNumber: string; trackingUrl: string };
type TradeType = 'service' | 'goods' | 'mixed' | undefined;

export function deliveryNeedsShipment(tradeType: TradeType): boolean {
  return tradeType === 'goods' || tradeType === 'mixed';
}

/// The same bar the backend holds: goods and mixed orders name the carrier and
/// a reference of at least 3 characters, plus an https tracking page when the
/// carrier has none Karwan knows; a service hands over its proof.
export function deliveryReady(input: {
  tradeType: TradeType;
  proof: string;
  shipment: Shipment;
  carrier: { slug: string; needsUrl: boolean } | undefined;
}): boolean {
  if (!deliveryNeedsShipment(input.tradeType)) return input.proof.trim().length > 0;
  const { shipment, carrier } = input;
  if (!carrier || carrier.slug !== shipment.carrier) return false;
  if (shipment.trackingNumber.trim().length < 3) return false;
  return !carrier.needsUrl || /^https:\/\/\S+$/.test(shipment.trackingUrl.trim());
}
