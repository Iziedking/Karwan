import type { DirectDeal } from '../db/deals.js';
import { extractUrls } from '../security/extractUrls.js';

export type DeliveryHistoryView = Array<{
  revision: number;
  submittedAt: number;
  milestone?: number;
  shipment?: { carrierName: string; trackingNumber: string; trackingUrl: string | null };
  photos?: number;
  handedOverAt?: number;
  deliveryProof?: string;
  held?: true;
  deliveryMatch?: { verdict: string; reason: string };
}>;

const HELD = new Set(['suspicious', 'malicious']);

/// Every delivery on a deal as one side may see it. The buyer never gets a link
/// that was held as unsafe, only that one was held; the seller never gets the
/// buyer's private review of the work.
export function deliveryHistoryFor(history: DirectDeal['deliveryHistory'], viewer: 'buyer' | 'seller'): DeliveryHistoryView {
  return (history ?? []).map((entry) => {
    const held = !!entry.verificationStatus && HELD.has(entry.verificationStatus);
    const hideProof = held && viewer === 'buyer';
    return {
      revision: entry.revision,
      submittedAt: entry.submittedAt,
      ...(entry.milestone !== undefined ? { milestone: entry.milestone } : {}),
      ...(entry.shipment ? { shipment: entry.shipment } : {}),
      ...(entry.photos && !hideProof ? { photos: entry.photos } : {}),
      ...(entry.handedOverAt ? { handedOverAt: entry.handedOverAt } : {}),
      ...(entry.deliveryProof && !hideProof ? { deliveryProof: entry.deliveryProof } : {}),
      ...(held ? { held: true as const } : {}),
      ...(viewer === 'buyer' && entry.deliveryMatch ? { deliveryMatch: entry.deliveryMatch } : {}),
    };
  });
}

const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);

function milestoneCount(deal: DirectDeal): number {
  if (deal.milestonePcts?.length) return deal.milestonePcts.length;
  return deal.firstReleasePct >= 100 ? 1 : 2;
}

/// What the assistant may tell one side about the delivery: the same facts as
/// the deal page's Delivery card, under the same rules.
export function deliveryForAssistant(deal: DirectDeal, viewer: 'buyer' | 'seller'): Record<string, unknown> | null {
  const history = deal.deliveryHistory ?? [];
  if (!deal.delivered && !deal.shipment && history.length === 0) return null;
  const held = HELD.has(deal.verificationStatus ?? '');
  const proof = held && viewer === 'buyer' ? undefined : deal.deliveryProof;
  const total = milestoneCount(deal);
  const shipment = deal.shipment;
  return {
    deliveredAt: iso(deal.deliveredAt),
    ...(total > 1 && deal.deliveredMilestone !== undefined ? { milestone: `${deal.deliveredMilestone + 1} of ${total}` } : {}),
    note: proof ?? null,
    links: extractUrls(proof ?? '').map((u) => u.href),
    heldForSafetyCheck: held,
    shipment: shipment
      ? {
          carrier: shipment.carrierName,
          trackingNumber: shipment.trackingNumber,
          trackingPage: shipment.trackingUrl,
          sentAt: iso(shipment.dispatchedAt),
          arrivedAt: iso(shipment.arrivedAt),
          buyerCanConfirmArrival: viewer === 'buyer' && !shipment.arrivedAt && !deal.settledAt && !deal.cancelledAt && !deal.disputed,
        }
      : null,
    ...(viewer === 'buyer' && !held && deal.deliveryMatch ? { matchesRequest: deal.deliveryMatch } : {}),
    earlierDeliveries: Math.max(0, history.length - 1),
    documents: (deal.documentRefs ?? []).map((d) => ({ kind: d.kind, label: d.label ?? null })),
  };
}
