import type { FactoringOffer, POFinancingLine } from '@/core/api';
import type { DealStage } from '@/features/deals/components/DirectDealList';

export function isOpenDirectDealStage(stage: DealStage): boolean {
  return !['settled', 'cancelled', 'disputed'].includes(stage);
}

export function directDealNeedsViewer(
  stage: DealStage,
  isBuyer: boolean,
): boolean {
  switch (stage) {
    case 'awaiting-acceptance':
    case 'awaiting-delivery':
      return !isBuyer;
    case 'awaiting-funding':
    case 'awaiting-first-release':
    case 'awaiting-final-release':
      return isBuyer;
    default:
      return false;
  }
}

/// A deal the viewer financed, from the financier's side: they never act on
/// the deal, they wait on it.
export type FinancedStage = 'delivering' | 'overdue' | 'reviewing' | 'disputed' | 'complete' | 'refunded';

export function financedStage(stage: DealStage, deadlineUnix: number | undefined, now = Date.now()): FinancedStage {
  switch (stage) {
    case 'awaiting-first-release':
    case 'awaiting-final-release':
      return 'reviewing';
    case 'disputed':
      return 'disputed';
    case 'settled':
      return 'complete';
    case 'cancelled':
      return 'refunded';
    default:
      return deadlineUnix && deadlineUnix * 1000 < now ? 'overdue' : 'delivering';
  }
}

export interface OpenFinancedPosition {
  kind: 'factoring' | 'po';
  id: string;
  jobId: string;
  /// What the financier put in, and what the deal pays them back.
  advanced: string;
  back: string;
  href: string;
}

/// Positions whose repayment is still owed. Finished ones live on the desk.
export function openFinancedPositions(
  offers: readonly FactoringOffer[],
  lines: readonly POFinancingLine[],
): OpenFinancedPosition[] {
  const out: OpenFinancedPosition[] = [];
  for (const offer of offers) {
    if (offer.status !== 'accepted' && offer.status !== 'pending_receipt') continue;
    out.push({ kind: 'factoring', id: offer.id, jobId: offer.invoiceId.toLowerCase(), advanced: offer.offeredAdvanceUsdc, back: offer.expectedReturnUsdc, href: `/financier/factoring/${encodeURIComponent(offer.id)}` });
  }
  for (const line of lines) {
    if (line.state !== 'outstanding' && line.state !== 'funded' && line.state !== 'released') continue;
    out.push({ kind: 'po', id: line.id, jobId: line.invoiceId.toLowerCase(), advanced: line.principalUsdc, back: line.repayUsdc, href: `/financier/po/${encodeURIComponent(line.id)}` });
  }
  return out;
}
