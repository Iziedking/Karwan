import type { ChainEvent } from '@/core/api';

// Public activity feed: clean platform record, not every negotiation tick.
// We keep events that have a real-world receipt (a posting, a match, an
// on-chain settlement, a bridge mint) and drop ephemeral agent chatter
// (per-round counters, score calculations, market scans, near-miss
// internals, mid-cancellation proposals). Parties still see those on
// their own deal page; this feed stays terse so users can scan or search
// by ID without parsing pages of noise. Mirrors PUBLIC_EVENT_TYPES in
// backend/src/routes/activity.ts. Needed on the client too because the
// live SSE stream delivers raw events of every type; the backend
// allowlist only covers the initial backfill fetch.
export const PUBLIC_EVENT_TYPES = new Set<string>([
  // request lifecycle
  'job.posted', 'job.tracked', 'job.expired',
  // bid surfaced and the bid that closed the deal. Drop scoring noise
  'bid.submitted', 'bid.accepted',
  // matches that landed (decline + approve internals stay private)
  'deal.matched',
  // deal lifecycle: only the outcomes, not the back-and-forth on cancel
  'deal.direct.created', 'deal.accepted', 'deal.delivered',
  'deal.review.started', 'deal.auto_released', 'deal.disputed',
  'deal.cancelled',
  // on-chain settlement / agent txns
  'escrow.approved', 'escrow.funded', 'escrow.milestone.released', 'escrow.settled',
  'reputation.recorded',
  // listings (the records, not the proactive-match noise)
  'listing.posted', 'listing.matched', 'listing.cancelled', 'listing.expired',
  'brief.cancelled',
  // cross-chain bridge completion (intermediate states stay personal)
  'bridge.minted',
]);

// Full 20-byte wallet address. Job IDs and tx hashes are 32 bytes (0x + 64 hex)
// and never match, so they stay intact for the explorer deep-links.
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

// Payload keys that name a party or carry a deal value. For a finance-lane
// (business) event they are dropped so only the fact of the event remains.
const ADDRESS_KEYS = new Set<string>([
  'buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy',
  'buyerAgent', 'sellerAgent', 'user', 'recipient', 'from', 'to', 'mintRecipient',
]);
const AMOUNT_KEYS = new Set<string>([
  'amountUsdc', 'dealAmountUsdc', 'agreedPriceUsdc', 'budgetUsdc', 'priceUsdc',
  'askingPriceUsdc', 'milestoneAmountUsdc', 'faceValueUsdc', 'advanceUsdc', 'value',
]);

function maskValue(v: string): string {
  return ADDR_RE.test(v) ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

function maskPayload(p: Record<string, unknown>, bare: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (bare && (ADDRESS_KEYS.has(k) || AMOUNT_KEYS.has(k))) continue;
    out[k] = typeof v === 'string' ? maskValue(v) : v;
  }
  return out;
}

/// Reduce the raw live stream to the general/public trade feed: drop non-trade
/// event types and mask any wallet address for display. Backfill events arrive
/// already masked from the backend; masking again is idempotent (a masked
/// "0x1234…abcd" no longer matches the full-address regex). When a finance-lane
/// jobId set is supplied, business-deal events are stripped to bare (amount and
/// parties removed) so the public feed never exposes a business deal's size or
/// counterparties.
export function publicizeEvents(
  events: ChainEvent[],
  financeJobIds?: Set<string>,
): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const e of events) {
    if (!PUBLIC_EVENT_TYPES.has(e.type)) continue;
    const bare = !!financeJobIds && !!e.jobId && financeJobIds.has(e.jobId.toLowerCase());
    out.push({ ...e, payload: maskPayload(e.payload ?? {}, bare) });
  }
  return out;
}
