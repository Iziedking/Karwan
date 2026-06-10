import { Hono } from 'hono';
import { bus, type KarwanEvent } from '../events.js';

export const activityRoutes = new Hono();

// Payload keys that identify a party. When the caller query is set, an event
// is only included if one of these keys on its payload matches the caller.
// jobId-scoped events (e.g. follow-up escrow.* events on a deal you opened)
// are included via the trackedJobIds pass.
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy'] as const;

function isParty(event: KarwanEvent, caller: string): boolean {
  const payload = event.payload as Record<string, unknown> | undefined;
  if (!payload) return false;
  for (const k of PARTY_KEYS) {
    const v = payload[k];
    if (typeof v === 'string' && v.toLowerCase() === caller) return true;
  }
  return false;
}

// The general/public feed shows trade activity (requests, bids, negotiation,
// matches, deal lifecycle, on-chain settlement, listings) PLUS the completion
// step of CCTP bridges; bridge.minted is the moment USDC lands on Arc and
// counts as visible network activity. The intermediate bridge states
// (approving, burning, attested, error) stay private since they're noisy and
// each successful bridge already produces exactly one bridge.minted.
// Account, platform, and other personal events (telegram link, agent
// activation, agent funding/withdrawal, staking, tier-ups, private chat,
// errors) stay NOT public. An allowlist, not a blocklist, so a new event
// type is private by default until deliberately surfaced.
/// Activity stream is a clean platform record, not a play-by-play of every
/// negotiation. We keep the events that have a real-world receipt (a
/// posting, a match, an on-chain settlement, a bridge mint) and drop the
/// ephemeral agent chatter (per-round counters, score calculations, market
/// scans, near-miss internals, mid-cancellation proposals). Parties still
/// see those internals on their own deal page; this feed stays terse so
/// users can scan or search by ID without parsing pages of noise.
const PUBLIC_EVENT_TYPES = new Set<string>([
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
  // cross-chain bridge completion (intermediate states stay private)
  'bridge.minted',
]);

// Payload keys that hold wallet addresses; redacted to a short form on the
// public feed so we don't leak full addresses to crawlers / observers.
const ADDRESS_KEYS = new Set<string>([
  'buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy',
  'buyerAgent', 'sellerAgent', 'user', 'recipient', 'from', 'to',
  'mintRecipient',
]);
// Payload keys that hold free-form text the parties exchanged. Stripped on the
// public feed so cancel/decline reasons don't end up indexed.
const FREEFORM_KEYS = new Set<string>(['reason', 'cancelReason', 'detail', 'deliveryProof']);

function maskAddress(addr: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function redactPayload(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (FREEFORM_KEYS.has(k)) continue;
    if (ADDRESS_KEYS.has(k) && typeof v === 'string') {
      out[k] = maskAddress(v);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function redactEvent(e: KarwanEvent): KarwanEvent {
  return {
    ...e,
    jobId: e.jobId,
    payload: redactPayload(e.payload ?? {}),
  };
}

/// Returns events filtered to the caller when ?caller= is set, otherwise the
/// global stream. The caller-filtered shape powers /activity for the connected
/// wallet. The unfiltered shape powers the landing-page tickers (HeroFlow,
/// LivePulseStrip, StatsTicker). Sanitizing that public feed is a separate
/// task; for now it still leaks addresses.
activityRoutes.get('/', (c) => {
  const limitParam = c.req.query('limit');
  const jobId = c.req.query('jobId') ?? undefined;
  const callerRaw = c.req.query('caller');
  const caller = callerRaw && /^0x[a-fA-F0-9]{40}$/.test(callerRaw) ? callerRaw.toLowerCase() : null;
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;

  // First pass: respect the existing jobId filter (used by per-deal timelines).
  const base = bus.recent(500, jobId);

  if (!caller) {
    // Public form: keep only trade activity, then redact wallet addresses and
    // strip free-form text so the general feed and landing-page tickers never
    // leak account/platform events, parties, or party-authored reasons.
    const publicEvents = base.filter((e) => PUBLIC_EVENT_TYPES.has(e.type));
    return c.json({ events: publicEvents.slice(0, limit).map(redactEvent) });
  }

  // Two-pass filter so we don't drop follow-up events that lack party fields
  // in their payload but belong to a job the caller is a party to. Pass 1
  // collects jobIds where the caller is named in a party field; pass 2 keeps
  // every event whose jobId is in that set OR whose payload names the caller.
  const callerJobIds = new Set<string>();
  for (const e of base) {
    if (isParty(e, caller) && e.jobId) callerJobIds.add(e.jobId.toLowerCase());
  }
  const events = base.filter((e) => {
    if (isParty(e, caller)) return true;
    if (e.jobId && callerJobIds.has(e.jobId.toLowerCase())) return true;
    return false;
  });

  return c.json({ events: events.slice(0, limit) });
});
