export type BidOutcome = 'won' | 'lost' | 'withdrawn' | 'expired';

export interface BidOutcomeRecord {
  jobId: string;
  sellerAgent: string;
  title: string | null;
  outcome: BidOutcome;
  lastPrice: string;
  at: number;
}

export interface DealParties {
  seller: string;
  sellerAgentAddress?: string;
}

const TITLE_MAX = 80;

/// The request's name for lists: the first line of the brief, trimmed. It
/// carries no party, so it is safe on a seller's list.
export function requestTitle(briefText?: string | null): string | null {
  const first = (briefText ?? '').trim().split('\n')[0]?.trim() ?? '';
  if (!first) return null;
  return first.length > TITLE_MAX ? first.slice(0, TITLE_MAX) : first;
}

function same(a: string | undefined, b: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/// How a bid ended, read from the deal store rather than guessed from the bid
/// disappearing. null means it has not ended yet.
export function settleBid(
  bid: { jobId: string; sellerAgent: string; sellerUser: string; deadlineUnix: number },
  deal: DealParties | null,
  now: number,
): BidOutcome | null {
  if (deal) {
    return same(deal.sellerAgentAddress, bid.sellerAgent) || same(deal.seller, bid.sellerUser) ? 'won' : 'lost';
  }
  if (bid.deadlineUnix * 1000 < now) return 'expired';
  return null;
}

/// Newest first, one record per request, at most `max`.
export function appendCapped(
  list: readonly BidOutcomeRecord[],
  record: BidOutcomeRecord,
  max = 50,
): BidOutcomeRecord[] {
  const key = record.jobId.toLowerCase();
  return [record, ...list.filter((r) => r.jobId.toLowerCase() !== key)].slice(0, max);
}
