import type { ChainEvent } from '@/core/api';

export type StructuredOfferSnapshot = NonNullable<ChainEvent['structuredOffer']>;

export function latestStructuredOffer(
  events: readonly ChainEvent[],
): StructuredOfferSnapshot | null {
  const offers = events
    .map((event) => event.structuredOffer)
    .filter((offer): offer is StructuredOfferSnapshot =>
      !!offer &&
      offer.id.trim().length > 0 &&
      Number.isSafeInteger(offer.version) &&
      offer.version > 0 &&
      /^\d+(?:\.\d{1,6})?$/.test(offer.amountUsdc) &&
      Number.isFinite(offer.updatedAt) &&
      offer.updatedAt > 0,
    );
  if (offers.length === 0) return null;
  return offers.reduce((latest, offer) => {
    if (offer.version !== latest.version) return offer.version > latest.version ? offer : latest;
    return offer.updatedAt > latest.updatedAt ? offer : latest;
  });
}
