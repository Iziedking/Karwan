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

/// Reduce the raw live stream to the general/public PULSE: keep only trade
/// event types, then strip each to the fact that something happened, of what
/// kind, by which actor role, and when. No parties, amounts, deal id, or text
/// ever reach the general feed for anyone. Parties still see full detail on
/// their own /activity (caller-filtered) and on their private deal page. Mirrors
/// the backend `pulseEvent` in routes/activity.ts; the live SSE stream carries
/// raw payloads, so this is the client-side counterpart.
export function publicizeEvents(events: ChainEvent[]): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const e of events) {
    if (!PUBLIC_EVENT_TYPES.has(e.type)) continue;
    out.push({ type: e.type, actor: e.actor, ts: e.ts, payload: {} });
  }
  return out;
}
