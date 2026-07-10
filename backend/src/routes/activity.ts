import { Hono } from 'hono';
import { bus, recentEventsByType, type KarwanEvent } from '../events.js';
import { listAllBriefs } from '../db/briefs.js';
import { listAllDeals } from '../db/deals.js';
import { sessionAddress } from '../auth/session.js';
import { callerJobIds, buyerJobIds, AUCTION_INTERNAL_TYPES } from '../auth/partyScope.js';

export const activityRoutes = new Hono();

// Finance-lane jobIds, cached so the public feed can strip business deals to
// bare events on every poll without re-scanning briefs + deals each time.
// Business trade is sensitive: the public feed shows that a finance-lane deal
// moved, never its amount or parties. The two parties still see everything on
// their own feed and deal page.
let financeCache: { at: number; ids: Set<string> } | null = null;
const FINANCE_CACHE_TTL_MS = 15_000;

async function financeJobIds(): Promise<Set<string>> {
  const now = Date.now();
  if (financeCache && now - financeCache.at < FINANCE_CACHE_TTL_MS) {
    return financeCache.ids;
  }
  const ids = new Set<string>();
  for (const b of listAllBriefs()) {
    if (b.tradeLane === 'finance' && b.jobId) ids.add(b.jobId.toLowerCase());
  }
  for (const d of await listAllDeals()) {
    if (d.tradeLane === 'finance' && d.jobId) ids.add(d.jobId.toLowerCase());
  }
  financeCache = { at: now, ids };
  return ids;
}

// Payload keys that identify a party. When the caller query is set, an event
// is only included if one of these keys on its payload matches the caller.
// jobId-scoped events (e.g. follow-up escrow.* events on a deal you opened)
// are included via the trackedJobIds pass.
// 'financier' is a party to the FINANCING events on a deal (factoring.*, po.*)
// without being a party to the deal itself, so callerJobIds never covers them.
// Without this key a financier's own offers and repayments never reach their
// activity feed or their notification bell.
const PARTY_KEYS = ['buyer', 'seller', 'sellerUser', 'buyerUser', 'postedBy', 'financier'] as const;

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

/// The general/public feed is a privacy PULSE: it shows that activity is
/// happening and of what kind, never who, how much, or which deal. We keep only
/// the event type, the actor ROLE (a role, never an address), and the time, and
/// drop the jobId and the entire payload. Parties still see full detail on their
/// own feed (the caller branch below) and on their private deal page. This is
/// the stronger privacy posture: even masked addresses and amounts no longer
/// leave the platform for anyone but the two parties.
function pulseEvent(e: KarwanEvent): KarwanEvent {
  return { type: e.type, actor: e.actor, ts: e.ts, payload: {} };
}

/// Returns events filtered to the caller when ?caller= is set, otherwise the
/// global stream. The caller-filtered shape powers /activity for the connected
/// wallet. The unfiltered shape powers the landing-page tickers (HeroFlow,
/// LivePulseStrip, StatsTicker). Sanitizing that public feed is a separate
/// task; for now it still leaks addresses.
activityRoutes.get('/', async (c) => {
  const limitParam = c.req.query('limit');
  const jobId = c.req.query('jobId') ?? undefined;
  // Scope to the connected wallet only when the request asks for a personal or
  // per-deal view: the ?caller= param (personal notifications feed) or a jobId
  // (a deal timeline) opts in. The bare /activity network log (neither set) is
  // always the global public pulse, even when signed in, so "AUDIT THE CHAIN"
  // shows network-wide activity rather than only the viewer's own deals. The
  // caller-filtered feed returns full unredacted events (amounts, parties) for
  // deals the caller is a party to, so identity is the signed session, never
  // the spoofable ?caller= param. No session on a scoped request falls through
  // to the public pulse.
  const callerParam = c.req.query('caller');
  const wantsScoped = (callerParam != null && callerParam !== '') || jobId != null;
  const caller = wantsScoped ? sessionAddress(c) : null;
  const limit = limitParam ? Math.min(500, Math.max(1, Number(limitParam))) : 100;

  // Reload from event_history if the in-memory ring came up cold (boot hydrate
  // ran against a down Postgres). Throttled + no-op once warm.
  await bus.ensureHydrated();

  // First pass: respect the existing jobId filter (used by per-deal timelines).
  const base = bus.recent(500, jobId);

  if (!caller) {
    // Public form: keep only trade-activity event types, then reduce each to a
    // privacy pulse (type + actor role + time, no parties, amounts, deal id, or
    // text) for EVERY lane. The general feed proves the network is alive without
    // revealing anything about a specific deal. Read public-typed events from
    // event_history (the in-memory ring is small and saturated by negotiation /
    // chat noise that pushes sparse public events out); fall back to the ring
    // when Postgres is off.
    const fromPg = await recentEventsByType([...PUBLIC_EVENT_TYPES], limit, jobId);
    const publicEvents =
      fromPg.length > 0 ? fromPg : base.filter((e) => PUBLIC_EVENT_TYPES.has(e.type));
    return c.json({ events: publicEvents.slice(0, limit).map(pulseEvent) });
  }

  // Party membership: the durable stores (briefs posted, deals, proposals)
  // plus a payload scan of this window. Auction-phase events carry only agent
  // addresses, so without the durable seed a buyer's own live auction would
  // filter to nothing here.
  const [callerJobs, buyerJobs] = await Promise.all([
    callerJobIds(caller),
    buyerJobIds(caller),
  ]);
  for (const e of base) {
    if (isParty(e, caller) && e.jobId) callerJobs.add(e.jobId.toLowerCase());
  }
  const events = base.filter((e) => {
    const inScope =
      isParty(e, caller) || (!!e.jobId && callerJobs.has(e.jobId.toLowerCase()));
    if (!inScope) return false;
    // Seller-side privacy: the caller is a party to this job but not its buyer,
    // so the competitive auction internals (rival bids, scores, counters, the
    // buyer's market strategy) never reach their notifications feed. Their own
    // match + settlement events are not in the internal set and stay.
    const jobKey = e.jobId?.toLowerCase();
    const isBuyerOfJob = !!jobKey && buyerJobs.has(jobKey);
    if (!isBuyerOfJob && AUCTION_INTERNAL_TYPES.has(e.type)) return false;
    return true;
  });

  return c.json({ events: events.slice(0, limit) });
});

/// The set of finance-lane (business) jobIds. The /activity page masks the
/// live SSE stream client-side, so it fetches this to strip business deals to
/// bare events the same way the backfill feed above does. Masked jobIds are
/// not sensitive on their own; the point is to hide amount + parties.
activityRoutes.get('/finance-jobids', async (c) => {
  const ids = await financeJobIds();
  return c.json({ jobIds: [...ids] });
});
