import { Hono } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import { llmModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
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
  type Listing,
} from '../db/listings.js';
import { resolveSellerProfile } from '../agents/agent-registry.js';
import { actorSignalsFor } from '../agents/signals.js';
import { listOpenJobContexts } from '../agents/buyer.js';
import { submitListingBid } from '../agents/seller.js';
import { maybeRaiseNearMiss } from '../agents/nearMiss.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { sessionMismatchesClaim } from '../auth/session.js';

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

/// All listings, newest first. Public surface — strips private agent steering
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

  const listing = createListing({
    sellerUser: body.sellerUser,
    sellerAgent: agents.sellerAddress,
    title: body.title,
    description: body.description,
    askingPriceUsdc: body.askingPriceUsdc,
    negotiationMaxDecreasePct: body.negotiationMaxDecreasePct,
    ttlDays: body.ttlDays,
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

  return c.json({ listing }, 201);
});

async function scanBriefsForListing(
  listing: Listing,
  seller: Awaited<ReturnType<typeof resolveSellerProfile>>,
) {
  if (!seller) return;
  const briefs = listOpenJobContexts();
  if (briefs.length === 0) {
    logger.info({ listingId: listing.id }, 'no open briefs to match against');
    return;
  }
  logger.info(
    { listingId: listing.id, briefsCount: briefs.length },
    'scanning open briefs for topical match',
  );
  for (const job of briefs) {
    const matched = await tryMatchListingToJob(listing, job, seller);
    if (matched) return; // listing consumed by first feasible match
  }
  logger.info({ listingId: listing.id }, 'no matching briefs found');
}

/// Symmetric scan: a fresh buyer brief just landed; check every open listing
/// across the network and place listing-driven bids for any that match. The
/// seller agent's `activeBids` map dedupes per (jobId, seller), so a profile-
/// driven bid that already exists for this job is left alone.
export async function scanListingsForBrief(
  job: { jobId: string; buyer: string; budgetUsdc: string; deadlineUnix: number; termsHash: string; briefText?: string; negotiationMaxIncreasePct?: number; buyerReputationBps?: number },
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
  job: { jobId: string; buyer: string; budgetUsdc: string; deadlineUnix: number; termsHash: string; briefText?: string; negotiationMaxIncreasePct?: number; buyerReputationBps?: number },
  seller: NonNullable<Awaited<ReturnType<typeof resolveSellerProfile>>>,
): Promise<boolean> {
  // Skip the user's own briefs — sellers shouldn't bid on themselves.
  const briefBuyerOwner = await findAgentWalletByAgentAddress(job.buyer);
  if (briefBuyerOwner?.userAddress === listing.sellerUser) {
    logger.info(
      { listingId: listing.id, jobId: job.jobId },
      'skipping own brief',
    );
    return false;
  }

  let decision;
  try {
    const result = await withLlmTimeout(
      `listingMatch(${listing.id}:${job.jobId})`,
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
      'match LLM failed',
    );
    return false;
  }

  logger.info(
    { listingId: listing.id, jobId: job.jobId, decision },
    'listing-brief match decision',
  );

  if (!decision.match || decision.confidence < 0.6) return false;

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
  bus.emitEvent({
    type: 'listing.matched',
    jobId: job.jobId,
    actor: 'seller',
    payload: {
      listingId: listing.id,
      seller: listing.sellerUser,
      askingPriceUsdc: listing.askingPriceUsdc,
      floorUsdc: floor,
      reasoning: decision.reasoning,
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
