import type { FactoringOffer, POFinancingLine } from '@/core/api';
import type { NotifyCopy } from '@/shared/i18n/messages/notifications';

/// A financier is not a party to the deal they financed, but their repayment
/// rides on it. The server sends them these events for those deals, as the deal
/// id and the event type only (backend financial/dealFinanciers.ts holds the
/// same list).
export const FINANCED_DEAL_KEY: Record<string, keyof NotifyCopy['financed']> = {
  'deal.delivered': 'delivered',
  'deal.delivered.onchain': 'delivered',
  'escrow.milestone.released': 'released',
  'escrow.settled': 'settled',
  'deal.disputed': 'disputed',
  'deal.dispute.auto_resolved': 'disputeClosed',
  'escrow.refunded': 'refunded',
  'escrow.reclaimed': 'refunded',
  'deal.cancelled': 'refunded',
  'deal.deadline.passed': 'deadline',
};

export const FINANCED_DEAL_TYPES = new Set(Object.keys(FINANCED_DEAL_KEY));

const ADVANCED: ReadonlySet<FactoringOffer['status']> = new Set(['pending_receipt', 'accepted', 'settled', 'defaulted']);

/// The deals this person financed, each with their own position page.
export function financedPositions(
  offers: readonly FactoringOffer[],
  lines: readonly POFinancingLine[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const offer of offers) {
    if (ADVANCED.has(offer.status)) out.set(offer.invoiceId.toLowerCase(), `/financier/factoring/${encodeURIComponent(offer.id)}`);
  }
  for (const line of lines) {
    const key = line.invoiceId.toLowerCase();
    if (!out.has(key)) out.set(key, `/financier/po/${encodeURIComponent(line.id)}`);
  }
  return out;
}

/// The bell line for an event on a deal this person financed, or null when
/// they did not finance it or the event does not touch their repayment.
export function financedNotice(
  type: string,
  jobId: string,
  positions: ReadonlyMap<string, string>,
  copy: NotifyCopy,
): { summary: string; href: string } | null {
  const key = FINANCED_DEAL_KEY[type];
  const href = positions.get(jobId.toLowerCase());
  if (!key || !href) return null;
  return { summary: copy.financed[key], href };
}
