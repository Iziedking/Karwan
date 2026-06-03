import type { ChainEvent } from '@/core/api';

// The general/public activity feed shows only trade activity: requests, bids,
// negotiation, matches, deal lifecycle, on-chain settlement txns, and listings.
// Account, platform, and personal events (telegram link, agent activation,
// agent funding/withdrawal, staking, bridging, tier-ups, private chat, errors)
// are never shown. Mirrors PUBLIC_EVENT_TYPES in backend/src/routes/activity.ts.
// Needed on the client too because the live SSE stream delivers raw events of
// every type; the backend allowlist only covers the initial backfill fetch.
export const PUBLIC_EVENT_TYPES = new Set<string>([
  // request lifecycle
  'job.posted', 'job.tracked', 'job.expired',
  // bidding + negotiation
  'bid.submitted', 'bid.scored', 'bid.accepted',
  'counter.issued', 'counter.received', 'counter.evaluated', 'counter.response.submitted',
  'negotiation.attempt-ended', 'negotiation.next-candidate', 'negotiation.exhausted',
  'negotiation.near-miss', 'negotiation.near-miss.proceeded', 'negotiation.near-miss.declined',
  'market.scanned',
  // agent decisions
  'agent.decision', 'agent.skipped', 'agent.declined', 'agent.fallback',
  // matches
  'deal.matched', 'deal.match.declined', 'deal.match.approved',
  // deal lifecycle
  'deal.direct.created', 'deal.accepted', 'deal.delivered',
  'deal.review.started', 'deal.auto_released', 'deal.disputed',
  'deal.cancelled', 'deal.cancel.proposed', 'deal.cancel.declined',
  // on-chain settlement / agent txns
  'escrow.approved', 'escrow.funded', 'escrow.milestone.released', 'escrow.settled',
  'reputation.recorded',
  // listings
  'listing.posted', 'listing.matched', 'listing.cancelled', 'listing.expired',
  'brief.cancelled',
  // cross-chain bridge completion (intermediate states stay personal)
  'bridge.minted',
]);

// Full 20-byte wallet address. Job IDs and tx hashes are 32 bytes (0x + 64 hex)
// and never match, so they stay intact for the explorer deep-links.
const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

function maskValue(v: string): string {
  return ADDR_RE.test(v) ? `${v.slice(0, 6)}…${v.slice(-4)}` : v;
}

function maskPayload(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    out[k] = typeof v === 'string' ? maskValue(v) : v;
  }
  return out;
}

/// Reduce the raw live stream to the general/public trade feed: drop non-trade
/// event types and mask any wallet address for display. Backfill events arrive
/// already masked from the backend; masking again is idempotent (a masked
/// "0x1234…abcd" no longer matches the full-address regex).
export function publicizeEvents(events: ChainEvent[]): ChainEvent[] {
  const out: ChainEvent[] = [];
  for (const e of events) {
    if (!PUBLIC_EVENT_TYPES.has(e.type)) continue;
    out.push({ ...e, payload: maskPayload(e.payload ?? {}) });
  }
  return out;
}
