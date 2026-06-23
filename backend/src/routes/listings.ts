import { Hono } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import { llmModel } from '../llm/client.js';
import { withLlmRetry } from '../agents/llm-utils.js';
import {
  cancelListing,
  createListing,
  getListing,
  listAllListings,
  listListingsForSeller,
  listOpenListings,
  listingStatus,
  markListingMatched,
  listingFloor,
  patchListing,
  type Listing,
} from '../db/listings.js';
import { resolveSellerProfile } from '../agents/agent-registry.js';
import { actorSignalsFor } from '../agents/signals.js';
import { listOpenJobContexts } from '../agents/buyer.js';
import { submitListingBid } from '../agents/seller.js';
import { maybeRaiseNearMiss } from '../agents/nearMiss.js';
import { topicalOverlap } from '../llm/keywords.js';
import { emitAgentDecision } from '../agents/observability.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { sessionMismatchesClaim } from '../auth/session.js';
import { accountTypeOf, deriveLane } from '../profile/accountType.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const createSchema = z.object({
  sellerUser: addrSchema,
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(500),
  askingPriceUsdc: z.number().positive().max(5_000_000),
  negotiationMaxDecreasePct: z.number().min(0).max(50).optional(),
  /// Optional listing window in days. Defaults to 30 in the store. Capped at
  /// 90 to keep stale listings out of the marketplace. Fractional values
  /// allowed so the seller form can express minutes or hours for demos.
  /// Floor is roughly one minute so dust windows can't slip in.
  ttlDays: z.number().min(0.0006).max(90).optional(),
});

const cancelSchema = z.object({ caller: addrSchema });

/// Pre-match edit. Title, description, askingPrice, the agent's price floor,
/// and the listing window are all optional but at least one must change. The
/// sellerAgent address is not editable; rotating it mid-cycle would orphan a
/// running negotiation. Tolerance changes are picked up by listingFloor() on
/// the next bid evaluation since the floor is computed fresh per call rather
/// than cached in agent state.
const editSchema = z.object({
  caller: addrSchema,
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(5).max(500).optional(),
  askingPriceUsdc: z.number().positive().max(5_000_000).optional(),
  negotiationMaxDecreasePct: z.number().min(0).max(50).optional(),
  ttlDays: z.number().min(0.0006).max(90).optional(),
});

const matchDecisionSchema = z.object({
  match: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const listingsRoutes = new Hono();

function stripPrivateFields(l: Listing): Omit<Listing, 'negotiationMaxDecreasePct'> {
  const { negotiationMaxDecreasePct: _drop, ...rest } = l;
  return rest;
}

/// All listings, newest first. Public surface, strips private agent steering
/// (negotiationMaxDecreasePct) so a buyer-side LLM can't enumerate floors.
listingsRoutes.get('/', (c) => {
  return c.json({ listings: listAllListings().map(stripPrivateFields) });
});

/// Listings owned by the caller, with the private fields intact. The caller's
/// address must match the seller on each row, so this can safely return all
/// steering values for display on the owner's own page.
listingsRoutes.get('/mine', (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  return c.json({ listings: listListingsForSeller(parsed.data) });
});

/// Detail of one listing. `floor` and `negotiationMaxDecreasePct` are agent-
/// private steering values; if the caller isn't the seller, both are stripped
/// so a buyer-side LLM can't walk straight to the seller's bottom.
listingsRoutes.get('/:id', (c) => {
  const id = c.req.param('id');
  const listing = getListing(id);
  if (!listing) return c.json({ error: 'listing not found' }, 404);
  const callerRaw = c.req.query('caller');
  const caller =
    callerRaw && /^0x[a-fA-F0-9]{40}$/.test(callerRaw) ? callerRaw.toLowerCase() : null;
  const isOwner = caller === listing.sellerUser.toLowerCase();
  const status = listingStatus(listing);
  if (isOwner) {
    return c.json({
      listing,
      floor: listingFloor(listing),
      viewerIsOwner: true,
      status,
    });
  }
  const { negotiationMaxDecreasePct: _drop, ...publicListing } = listing;
  return c.json({ listing: publicListing, viewerIsOwner: false, status });
});

/// Seller cancels their own listing. Allowed only when it hasn't matched yet
/// (matchedAt unset) and isn't already cancelled. After a match the listing
/// is consumed by the deal flow; cancellation there would orphan the deal.
listingsRoutes.post('/:id/cancel', async (c) => {
  const id = c.req.param('id');
  let body;
  try {
    body = cancelSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const listing = getListing(id);
  if (!listing) return c.json({ error: 'listing not found' }, 404);
  // A Circle session may only act as its own wallet; the body `caller` is then
  // verified against the listing owner below. Together this stops a spoofed
  // body field from cancelling someone else's listing.
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== listing.sellerUser) {
    return c.json({ error: 'only the seller can cancel this listing' }, 403);
  }
  if (listing.matchedAt) {
    return c.json(
      { error: 'this listing already matched a brief; cancellation lives on the deal page' },
      409,
    );
  }
  if (listing.cancelledAt) {
    return c.json({ error: 'this listing is already cancelled' }, 409);
  }
  const next = cancelListing(id);
  bus.emitEvent({
    type: 'listing.cancelled',
    actor: 'seller',
    payload: {
      listingId: id,
      seller: listing.sellerUser,
      title: listing.title,
    },
  });
  logger.info({ listingId: id, seller: listing.sellerUser }, 'listing cancelled by seller');
  return c.json({ listing: next });
});

/// Seller edits their own listing. Allowed while the listing is open: not
/// matched into a deal, not cancelled, not past its expiry. Only title,
/// description, and askingPriceUsdc move; other fields would mid-cycle the
/// seller agent's bidding loop.
listingsRoutes.post('/:id/edit', async (c) => {
  const id = c.req.param('id');
  let body;
  try {
    body = editSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  const listing = getListing(id);
  if (!listing) return c.json({ error: 'listing not found' }, 404);
  if (sessionMismatchesClaim(c, body.caller)) {
    return c.json({ error: 'You can only act as your own wallet.', code: 'forbidden' }, 403);
  }
  if (body.caller.toLowerCase() !== listing.sellerUser) {
    return c.json({ error: 'only the seller can edit this listing' }, 403);
  }
  if (listing.matchedAt) {
    return c.json(
      { error: 'this listing already matched a brief; edits live on the deal page' },
      409,
    );
  }
  if (listing.cancelledAt) {
    return c.json({ error: 'this listing is cancelled' }, 409);
  }
  if (listing.expiresAt < Date.now()) {
    return c.json({ error: 'this listing has expired' }, 409);
  }

  const patch: Partial<
    Pick<
      Listing,
      'title' | 'description' | 'askingPriceUsdc' | 'negotiationMaxDecreasePct' | 'expiresAt'
    >
  > = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.askingPriceUsdc !== undefined) patch.askingPriceUsdc = body.askingPriceUsdc;
  if (body.negotiationMaxDecreasePct !== undefined) {
    patch.negotiationMaxDecreasePct = body.negotiationMaxDecreasePct;
  }
  if (body.ttlDays !== undefined) {
    // Anchor the new window from now so a shortened ttl can't land the
    // expiresAt in the past, which would expire the listing instantly. The
    // seller's intent is "I want this open for another N days from this
    // moment", not "I want it open for N days from when I first posted".
    patch.expiresAt = Date.now() + body.ttlDays * 86_400_000;
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ error: 'no editable fields provided' }, 400);
  }

  const next = patchListing(id, patch);
  logger.info(
    { listingId: id, seller: listing.sellerUser, changed: Object.keys(patch) },
    'listing edited by seller',
  );
  return c.json({ listing: next });
});

/// Post a new seller listing and immediately scan in-memory open buyer briefs
/// for a topical match. On match, the seller agent submits an on-chain bid
/// using the listing's asking price; the normal counter/accept flow takes over.
listingsRoutes.post('/', async (c) => {
  let body;
  try {
    body = createSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }
  // Authorization: a Circle session may only post a listing as its own wallet.
  // Matches the gate on jobs/deals/profile writes; web3 users have no session
  // yet, so this is a no-op for them (see auth/session.ts).
  if (sessionMismatchesClaim(c, body.sellerUser)) {
    return c.json({ error: 'You can only post a listing as your own wallet.', code: 'forbidden' }, 403);
  }

  const agents = await getAgentWallets(body.sellerUser);
  if (!agents) {
    return c.json(
      { error: 'activate your agent wallets before posting a listing' },
      409,
    );
  }
  const sellerProfile = await resolveSellerProfile(agents.sellerAddress);
  if (!sellerProfile) {
    return c.json(
      { error: 'set up a seller profile before posting a listing' },
      409,
    );
  }

  // A listing is a standing offer with no goods/service split, so it always
  // sits in the service lane (open to every account type). partyKind still
  // records whether the seller is a verified business so a match can badge it.
  const sellerAccountType = await accountTypeOf(body.sellerUser);
  const listing = createListing({
    sellerUser: body.sellerUser,
    sellerAgent: agents.sellerAddress,
    title: body.title,
    description: body.description,
    askingPriceUsdc: body.askingPriceUsdc,
    negotiationMaxDecreasePct: body.negotiationMaxDecreasePct,
    ttlDays: body.ttlDays,
    tradeLane: deriveLane(sellerAccountType, undefined),
    partyKind: sellerAccountType,
  });

  bus.emitEvent({
    type: 'listing.posted',
    actor: 'seller',
    payload: {
      listingId: listing.id,
      seller: listing.sellerUser,
      title: listing.title,
      askingPriceUsdc: listing.askingPriceUsdc,
    },
  });

  // Fire-and-forget cross-match scan. Returns from the HTTP request immediately;
  // any matches show up as bid.submitted events on the SSE stream.
  scanBriefsForListing(listing, sellerProfile).catch((err) =>
    logger.error({ listingId: listing.id, err: (err as Error).message }, 'listing scan failed'),
  );

  // Proactive scan: surface this offer to buyers whose recent history (past
  // briefs + past deal terms) overlaps topically, even if they have no open
  // brief right now. They get a bell + Telegram ping with a link to /listings/
  // and decide whether to open a direct deal from there.
  import('../agents/buyerHistoryScan.js')
    .then(({ scanBuyersForListing }) => scanBuyersForListing(listing))
    .catch((err) =>
      logger.error(
        { listingId: listing.id, err: (err as Error).message },
        'proactive buyer-history scan failed',
      ),
    );

  return c.json({ listing }, 201);
});

/// Cache of confirmed listing↔brief topical matches, keyed jobId → listingId →
/// the content the verdict was made on. The periodic re-scan re-touches every
/// open listing against every open brief each tick; without this it re-pays the
/// LLM to rediscover a match (or an uncrossable wall) it already found. We only
/// cache a POSITIVE match (a flaky LLM could wrongly cache a miss), and key it
/// on the brief + listing TEXT so an edit re-evaluates. Price is deliberately
/// not in the basis: the floor/ceiling check downstream runs fresh every tick,
/// so a budget edit re-checks crossability without busting this cache. Cleared
/// when a listing is consumed; otherwise bounded by open jobs × listings and
/// reset on restart.
const confirmedMatchCache = new Map<string, Map<string, string>>();

function matchBasis(
  job: { briefText?: string; keywords?: string[] },
  listing: Listing,
): string {
  return [
    (job.briefText ?? '').trim(),
    (job.keywords ?? []).join(','),
    listing.title,
    listing.description,
  ].join('||');
}

function rememberConfirmedMatch(jobId: string, listingId: string, basis: string): void {
  let m = confirmedMatchCache.get(jobId);
  if (!m) {
    m = new Map();
    confirmedMatchCache.set(jobId, m);
  }
  m.set(listingId, basis);
}

async function scanBriefsForListing(
  listing: Listing,
  seller: Awaited<ReturnType<typeof resolveSellerProfile>>,
) {
  if (!seller) return;
  const briefs = listOpenJobContexts();
  if (briefs.length === 0) {
    logger.info({ listingId: listing.id }, 'no open briefs to match against');
    // Surface the empty scan so the operator can spot the "brief is on chain
    // but the in-memory jobs map is empty" pattern (post-restart hole, or
    // buyer never activated their buyer agent). Without this the listing
    // appears posted then sits silent with no event explaining why.
    bus.emitEvent({
      type: 'market.scanned',
      actor: 'seller',
      payload: { listingId: listing.id, scanned: 0, matched: 0 },
    });
    return;
  }
  logger.info(
    { listingId: listing.id, briefsCount: briefs.length },
    'scanning open briefs for topical match',
  );
  let matched = 0;
  let consumedJobId: string | null = null;
  for (const job of briefs) {
    const ok = await tryMatchListingToJob(listing, job, seller);
    if (ok) {
      matched += 1;
      consumedJobId = job.jobId;
      break; // listing consumed by first feasible match
    }
  }
  bus.emitEvent({
    type: 'market.scanned',
    actor: 'seller',
    payload: {
      listingId: listing.id,
      scanned: briefs.length,
      matched,
      ...(consumedJobId ? { consumedJobId } : {}),
    },
  });
  if (matched === 0) {
    logger.info({ listingId: listing.id, briefsCount: briefs.length }, 'no matching briefs found');
  }
}

/// Symmetric scan: a fresh buyer brief just landed; check every open listing
/// across the network and place listing-driven bids for any that match. The
/// seller agent's `activeBids` map dedupes per (jobId, seller), so a profile-
/// driven bid that already exists for this job is left alone.
export async function scanListingsForBrief(
  job: { jobId: string; buyer: string; budgetUsdc: string; deadlineUnix: number; termsHash: string; briefText?: string; negotiationMaxIncreasePct?: number; buyerReputationBps?: number; tradeLane?: 'service' | 'finance' },
) {
  const listings = listOpenListings();
  if (listings.length === 0) return;
  logger.info(
    { jobId: job.jobId, listingsCount: listings.length },
    'fresh brief, scanning open listings',
  );
  const TIER_RANK: Record<string, number> = {
    new: 0,
    cold: 1,
    established: 2,
    strong: 3,
    elite: 4,
  };
  let matched = 0;
  let topTier: string | null = null;
  for (const listing of listings) {
    const seller = await resolveSellerProfile(listing.sellerAgent);
    if (!seller) continue;
    const ok = await tryMatchListingToJob(listing, job, seller);
    if (!ok) continue;
    matched += 1;
    // The agent doesn't gate the scan on reputation (a relevant listing always
    // gets to bid), but it does read each matched candidate's tier so the
    // ranking that follows is reputation-aware. Track the strongest match.
    try {
      const sig = await actorSignalsFor(seller.address);
      if (!topTier || (TIER_RANK[sig.repTier] ?? -1) > (TIER_RANK[topTier] ?? -1)) {
        topTier = sig.repTier;
      }
    } catch {
      /* reputation read is best-effort; never block the scan on it */
    }
  }
  // Surface that the agent shopped the marketplace, how it landed, and the best
  // reputation among the matches. Renders as a "Market scanned" line on the job
  // timeline so a buyer (or judge) sees the agent considered the open listings
  // and weighed reputation rather than picking blind.
  bus.emitEvent({
    type: 'market.scanned',
    jobId: job.jobId,
    actor: 'buyer',
    payload: { scanned: listings.length, matched, ...(topTier ? { topTier } : {}) },
  });
}

async function tryMatchListingToJob(
  listing: Listing,
  job: { jobId: string; buyer: string; budgetUsdc: string; deadlineUnix: number; termsHash: string; briefText?: string; negotiationMaxIncreasePct?: number; buyerReputationBps?: number; keywords?: string[]; tradeLane?: 'service' | 'finance' },
  seller: NonNullable<Awaited<ReturnType<typeof resolveSellerProfile>>>,
): Promise<boolean> {
  // Lane partition: a listing and a brief only match within the same lane.
  // Listings are service-lane, so this keeps SME/B2B finance briefs from ever
  // matching a P2P service offer (and vice versa). This is the non-leak guard.
  const listingLane = listing.tradeLane ?? 'service';
  const jobLane = job.tradeLane ?? 'service';
  if (listingLane !== jobLane) return false;

  // Skip the user's own briefs, sellers shouldn't bid on themselves.
  const briefBuyerOwner = await findAgentWalletByAgentAddress(job.buyer);
  if (briefBuyerOwner?.userAddress === listing.sellerUser) {
    logger.info(
      { listingId: listing.id, jobId: job.jobId },
      'skipping own brief',
    );
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        listingId: listing.id,
        seller: listing.sellerUser,
        reason: 'own-brief',
        detail: 'Karwan keeps a seller out of matching against their own request.',
      },
    });
    return false;
  }

  // Deterministic topical signal so a flaky LLM call can't silently drop a real
  // match (and with it the bid / near-miss). Brief keywords vs the listing's own
  // words, generic filler ("account", "service") stripped.
  const topical =
    topicalOverlap(job.keywords ?? [], [listing.title, listing.description]) > 0;

  // Skip the LLM when this exact brief + listing text already confirmed a match
  // on a prior scan. The recurring reconciler otherwise re-pays the model every
  // ~90s to rediscover the same verdict (most visibly on an uncrossable listing
  // that bounces off the price wall forever). The price check below still runs
  // fresh, so a budget change re-evaluates crossability.
  const basis = matchBasis(job, listing);
  const cachedConfirmed = confirmedMatchCache.get(job.jobId)?.get(listing.id) === basis;

  let decision: { match: boolean; confidence: number; reasoning?: string } | null = null;
  if (cachedConfirmed) {
    emitAgentDecision({
      jobId: job.jobId,
      actor: 'seller',
      stage: 'relevance',
      decision: 'matched',
      source: 'cache',
      detail: `"${listing.title}" matches this request`,
      signals: { listingId: listing.id, topical, cached: true },
    });
  } else {
    try {
      const result = await withLlmRetry(`listingMatch(${listing.id}:${job.jobId})`, () =>
        generateObject({
          model: llmModel,
          schema: matchDecisionSchema,
          prompt: buildListingMatchPrompt(listing, job),
        }),
      );
      decision = result.object;
    } catch (err) {
      logger.warn(
        { listingId: listing.id, jobId: job.jobId, err: (err as Error).message },
        'match LLM failed; falling back to keyword overlap',
      );
    }

    logger.info(
      { listingId: listing.id, jobId: job.jobId, decision, topical },
      'listing-brief match decision',
    );

    if (decision) {
      // The LLM answered. Respect an explicit rejection (it also runs the
      // direction check: offer-vs-request).
      // Trust the LLM's positive match more aggressively. Below 0.4 confidence
      // is fence-sitting; above is intent. The old 0.6 floor dropped
      // textbook-clear matches like "API services" vs "I need API services"
      // when Gemini Flash Lite returned 0.5-0.6. The topical fallback then
      // missed because keywords hadn't been extracted yet.
      if (!decision.match || decision.confidence < 0.4) {
        emitAgentDecision({
          jobId: job.jobId,
          actor: 'seller',
          stage: 'relevance',
          decision: 'skipped',
          source: 'llm',
          reason: 'not-a-match',
          detail: `"${listing.title}" is not a match for this request`,
          reasoning: decision.reasoning,
          signals: { listingId: listing.id, confidence: decision.confidence, topical },
        });
        return false;
      }
    } else if (!topical) {
      // LLM unavailable AND no keyword overlap to lean on. Genuinely can't tell.
      emitAgentDecision({
        jobId: job.jobId,
        actor: 'seller',
        stage: 'relevance',
        decision: 'skipped',
        source: 'deterministic',
        reason: 'no-topical-overlap',
        detail: `"${listing.title}" shares no topic with this request, and the matcher was unavailable`,
        signals: { listingId: listing.id, topical: false },
      });
      return false;
    }
    // Proceeding: either the LLM confirmed, or it errored but the brief and
    // listing share a real topic word (e.g. "amazon").
    emitAgentDecision({
      jobId: job.jobId,
      actor: 'seller',
      stage: 'relevance',
      decision: 'matched',
      source: decision ? 'llm' : 'fallback',
      detail: `"${listing.title}" matches this request`,
      reasoning: decision?.reasoning,
      signals: {
        listingId: listing.id,
        topical,
        ...(decision ? { confidence: decision.confidence } : {}),
      },
    });
    // Confirmed: cache it so the next scan skips the LLM. Only positive verdicts
    // are cached; a miss is never cached (the LLM is intermittent).
    rememberConfirmedMatch(job.jobId, listing.id, basis);
  }

  const floor = listingFloor(listing);
  const buyerPct = job.negotiationMaxIncreasePct ?? 0;
  const buyerCeiling = Number(job.budgetUsdc) * (1 + buyerPct / 100);
  if (floor > buyerCeiling) {
    // Topical match, but the seller's floor sits above the buyer's ceiling, so
    // no price satisfies both ranges. Rather than skip silently, ask the blocked
    // side whether to stretch when the gap is small (a near-miss). The agent
    // becomes an assistant, not a wall. Falls back to a plain skip when the gap
    // is too wide to bother anyone with.
    const raised = await maybeRaiseNearMiss({
      jobId: job.jobId,
      buyerAgent: job.buyer,
      sellerAgent: listing.sellerAgent,
      deadlineUnix: job.deadlineUnix,
      buyerCeilingUsdc: buyerCeiling,
      sellerFloorUsdc: floor,
      // The LLM already confirmed this listing is the buyer's exact product
      // above, so surface it even at a wider stretch than a fuzzy profile guess.
      confirmedTopical: true,
    });
    if (raised) {
      logger.info(
        { listingId: listing.id, jobId: job.jobId, listingFloor: floor, buyerCeiling },
        'near-miss raised for an uncrossable but close match',
      );
      return false; // not consumed by a bid; the human decides whether to proceed
    }
    logger.info(
      {
        listingId: listing.id,
        jobId: job.jobId,
        listingFloor: floor,
        buyerCeiling,
        listingAsking: listing.askingPriceUsdc,
        buyerBudget: job.budgetUsdc,
      },
      'topical match but price gap uncrossable, skipping',
    );
    bus.emitEvent({
      type: 'agent.skipped',
      jobId: job.jobId,
      actor: 'seller',
      payload: {
        seller: listing.sellerUser,
        reason: 'price-gap-uncrossable',
        listingAskingUsdc: listing.askingPriceUsdc,
        listingFloorUsdc: floor,
        buyerBudgetUsdc: job.budgetUsdc,
        buyerCeilingUsdc: buyerCeiling,
      },
    });
    return false;
  }

  const result = await submitListingBid(
    { ...job, buyerReputationBps: job.buyerReputationBps ?? 5000 },
    seller,
    {
      askingPriceUsdc: listing.askingPriceUsdc,
      floorUsdc: floor,
      description: listing.description,
    },
  );
  if (!result.ok) return false;

  markListingMatched(listing.id, job.jobId);
  // The brief is consumed by this listing; drop its match cache so it doesn't
  // linger after the job leaves the open pool.
  confirmedMatchCache.delete(job.jobId);
  bus.emitEvent({
    type: 'listing.matched',
    jobId: job.jobId,
    actor: 'seller',
    payload: {
      listingId: listing.id,
      seller: listing.sellerUser,
      askingPriceUsdc: listing.askingPriceUsdc,
      floorUsdc: floor,
      reasoning: decision?.reasoning ?? 'Matched on shared keywords (LLM unavailable).',
    },
  });
  return true;
}

function buildListingMatchPrompt(listing: Listing, job: { briefText?: string; budgetUsdc: string; termsHash: string }): string {
  const brief = job.briefText ?? `(opaque, only terms hash ${job.termsHash})`;
  return [
    'You are a marketplace matcher. Decide whether a seller listing matches an open buyer brief.',
    '',
    'Seller listing:',
    `- Title: ${listing.title}`,
    `- Description: ${listing.description}`,
    `- Asking price: ${listing.askingPriceUsdc} USDC`,
    '',
    'Buyer brief:',
    `- Text: ${brief}`,
    `- Budget: ${job.budgetUsdc} USDC`,
    '',
    'Direction check (apply FIRST):',
    '- A listing must describe a service or deliverable that is BEING SOLD (e.g. "I sell X", "X for sale", "I build Y").',
    '- A brief must describe something the buyer NEEDS to acquire (e.g. "Need a backend engineer", "Looking for translation").',
    '- If the listing reads as a request ("I need", "Looking for", "Hiring") rather than an offer, return match=false with confidence 0.9 and reasoning "listing is mis-posted as a request, not an offer". Do NOT match it to a brief even if topics align.',
    '- If the brief reads as an offer ("I sell", "Available for"), return match=false with confidence 0.9 and reasoning "brief is mis-posted as an offer".',
    '',
    'Topical match (apply SECOND, only if direction is correct):',
    '- Decide if the brief and the listing describe the SAME service or deliverable.',
    '- Match generously on synonyms and abbreviations (e.g. "WL" ≈ "whitelist", "ES→AR" ≈ "Spanish to Arabic").',
    "- Match=true only if the listing's offer can clearly fulfill the brief. Price differences are OK — negotiation handles those.",
    '',
    'Output:',
    '- match: true | false',
    '- confidence: 0..1',
    '- reasoning: one sentence on why match=true or false',
  ].join('\n');
}

export { listOpenListings, listingFloor };
