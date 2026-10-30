import { publicApiUrl, type DirectDeal } from '@/core/api';
import { LINK_RE, linkHref } from '@/shared/utils/textLinks';

export type DeliveryLink = { url: string; host: string };
export type DocumentKind = NonNullable<DirectDeal['documentRefs']>[number]['kind'];

export interface DeliveryCardModel {
  links: DeliveryLink[];
  note: string | null;
  held: boolean;
  milestone: { number: number; total: number } | null;
  shipment: { carrierName: string; trackingNumber: string; trackingUrl: string | null; dispatchedAt: number; arrivedAt: number | null } | null;
  /// Goods handed over in person with the buyer's code: when, instead of a shipment.
  handedOverAt: number | null;
  photos: string[];
  canConfirmArrival: boolean;
  match: { verdict: 'aligned' | 'partial' | 'mismatch' | 'unknown'; reason: string } | null;
  earlier: Array<{ revision: number; submittedAt: number; milestoneNumber: number | null; links: DeliveryLink[]; trackingNumber: string | null; held: boolean; photos: string[] }>;
  documents: Array<{ kind: DocumentKind; label: string | null; anchoredAt: number | null }>;
}


/// Every web link inside a delivery note, in order and once each. A note is
/// usually a sentence with a link in it, so a link is never expected alone.
export function linksIn(text: string | undefined | null): DeliveryLink[] {
  const seen = new Set<string>();
  const links: DeliveryLink[] = [];
  for (const raw of (text ?? '').match(LINK_RE) ?? []) {
    const href = linkHref(raw.replace(/[.,;:!?)\]}]+$/, ''));
    if (!href) continue;
    const parsed = new URL(href);
    if (seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    links.push({ url: parsed.href, host: parsed.hostname.replace(/^www\./, '') });
  }
  return links;
}

/// The words of a note with its links taken out, or null when only links remain.
export function noteWithoutLinks(text: string | undefined | null): string | null {
  const note = (text ?? '').replace(LINK_RE, ' ').replace(/\s+/g, ' ').trim();
  return note.length > 0 ? note : null;
}

function milestoneCount(deal: DirectDeal): number {
  if (deal.onChain?.milestonePcts?.length) return deal.onChain.milestonePcts.length;
  if (deal.milestonePcts?.length) return deal.milestonePcts.length;
  return deal.firstReleasePct >= 100 ? 1 : 2;
}

const HELD = new Set(['suspicious', 'malicious']);

/// Links to a delivery's photos, read with the viewer's session.
export function deliveryPhotoUrls(jobId: string, revision: number, count: number): string[] {
  return Array.from({ length: count }, (_, n) => publicApiUrl(`/api/deals/direct/${jobId}/delivery-photos/${revision}/${n}`));
}

/// What the Delivery card shows on the deal page, the same for both sides
/// except the buyer's own review. Null until something has been delivered.
export function deliveryCard(deal: DirectDeal, viewerIsBuyer: boolean): DeliveryCardModel | null {
  const history = deal.deliveryHistory ?? [];
  if (!deal.delivered && !deal.shipment && history.length === 0) return null;
  const held = viewerIsBuyer && HELD.has(deal.verificationStatus ?? '');
  const proof = held ? undefined : deal.deliveryProof;
  const total = milestoneCount(deal);
  const latest = history.at(-1);
  const closed = !!deal.settledAt || !!deal.cancelledAt;
  return {
    links: linksIn(proof),
    note: noteWithoutLinks(proof),
    held,
    milestone: total > 1 && deal.deliveredMilestone !== undefined ? { number: deal.deliveredMilestone + 1, total } : null,
    handedOverAt: deal.shipment?.carrier === 'handover' ? deal.shipment.arrivedAt ?? deal.shipment.dispatchedAt : null,
    photos: !held && deal.deliveryPhotos ? deliveryPhotoUrls(deal.jobId, deal.deliveryPhotos.revision, deal.deliveryPhotos.count) : [],
    shipment: deal.shipment && deal.shipment.carrier !== 'handover'
      ? {
          carrierName: deal.shipment.carrierName,
          trackingNumber: deal.shipment.trackingNumber,
          trackingUrl: deal.shipment.trackingUrl,
          dispatchedAt: deal.shipment.dispatchedAt,
          arrivedAt: deal.shipment.arrivedAt ?? null,
        }
      : null,
    canConfirmArrival: viewerIsBuyer && !!deal.shipment && deal.shipment.carrier !== 'handover' && !deal.shipment.arrivedAt && !closed && !deal.disputed,
    match: viewerIsBuyer && !held && deal.deliveryMatch ? deal.deliveryMatch : null,
    earlier: history
      .filter((entry) => entry !== latest)
      .reverse()
      .map((entry) => ({
        revision: entry.revision,
        submittedAt: entry.submittedAt,
        milestoneNumber: total > 1 && entry.milestone !== undefined ? entry.milestone + 1 : null,
        links: linksIn(entry.deliveryProof),
        trackingNumber: entry.shipment?.trackingNumber ?? null,
        held: !!entry.held,
        photos: entry.photos ? deliveryPhotoUrls(deal.jobId, entry.revision, entry.photos) : [],
      })),
    documents: (deal.documentRefs ?? []).map((doc) => ({ kind: doc.kind, label: doc.label ?? null, anchoredAt: doc.anchoredAt ?? null })),
  };
}
