import type { DirectDeal } from '@/core/api';
import { dealRoute } from '../dealRouteModel';
import { dealKindOf } from './dealSteps';
import { deliveryCard } from './deliveryCardModel';

/// What sits under the title block for each kind of deal (view 92): a parcel
/// tracker for goods sent, the delivery itself for one job, and the plain steps
/// for every other kind until its own picture is built. Only facts the deal
/// already carries; anything missing is left out, never guessed.

export type ParcelHint = 'waitShip' | 'addTracking' | 'tapArrived' | 'arrived' | null;
export type DeliveryHint = 'waitDelivery' | 'deliverBy' | 'check' | 'waitCheck' | null;
export type Verdict = 'aligned' | 'partial' | 'mismatch' | 'received' | 'unknown';

export type KindPicture =
  | { kind: 'steps' }
  | {
      kind: 'parcel';
      carrierName: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      dispatchedAt: number | null;
      arrivedAt: number | null;
      hint: ParcelHint;
      dueAt: number | null;
      payAt: number | null;
    }
  | {
      kind: 'delivery';
      deliveredAt: number | null;
      links: Array<{ url: string; host: string }>;
      note: string | null;
      photos: number;
      held: boolean;
      verdict: Verdict | null;
      hint: DeliveryHint;
      dueAt: number | null;
      payAt: number | null;
    };

export function pictureFor(deal: DirectDeal, viewerIsBuyer: boolean): KindPicture {
  if (dealRoute(deal).kind === 'status') return { kind: 'steps' };
  const kind = dealKindOf(deal);
  const dueAt = deal.deadlineUnix ? deal.deadlineUnix * 1000 : null;
  const payAt = deal.releaseEligibleAtMs ?? null;

  if (kind === 'shipped') {
    const shipment = deal.shipment && deal.shipment.carrier !== 'handover' ? deal.shipment : null;
    const arrivedAt = shipment?.arrivedAt ?? null;
    const hint: ParcelHint = arrivedAt ? 'arrived' : shipment ? (viewerIsBuyer ? 'tapArrived' : null) : viewerIsBuyer ? 'waitShip' : 'addTracking';
    return {
      kind: 'parcel',
      carrierName: shipment?.carrierName ?? null,
      trackingNumber: shipment?.trackingNumber ?? null,
      trackingUrl: shipment?.trackingUrl ?? null,
      dispatchedAt: shipment?.dispatchedAt ?? null,
      arrivedAt,
      hint,
      dueAt,
      payAt,
    };
  }

  if (kind === 'one') {
    const card = deliveryCard(deal, viewerIsBuyer);
    const delivered = !!card;
    const yourMove = deal.view?.next.actor === 'you';
    const hint: DeliveryHint = !delivered ? (viewerIsBuyer ? 'waitDelivery' : 'deliverBy') : viewerIsBuyer ? (yourMove ? 'check' : null) : 'waitCheck';
    return {
      kind: 'delivery',
      deliveredAt: delivered ? deal.deliveredAt ?? deal.deliveryHistory?.at(-1)?.submittedAt ?? null : null,
      links: card?.links ?? [],
      note: card?.note ?? null,
      photos: card?.photos.length ?? 0,
      held: card?.held ?? false,
      verdict: card?.match?.verdict ?? null,
      hint,
      dueAt,
      payAt,
    };
  }

  return { kind: 'steps' };
}
