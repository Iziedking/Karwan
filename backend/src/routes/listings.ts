import { Hono } from 'hono';
import { z } from 'zod';
import { generateObject } from 'ai';
import { llmModel } from '../llm/client.js';
import { withLlmTimeout } from '../agents/llm-utils.js';
import {
  createListing,
  listAllListings,
  listListingsForSeller,
  listOpenListings,
  markListingMatched,
  listingFloor,
  type Listing,
} from '../db/listings.js';
import { resolveSellerProfile } from '../agents/agent-registry.js';
import { listOpenJobContexts } from '../agents/buyer.js';
import { submitListingBid } from '../agents/seller.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const createSchema = z.object({
  sellerUser: addrSchema,
  title: z.string().min(3).max(120),
  description: z.string().min(5).max(500),
  askingPriceUsdc: z.number().positive().max(5_000_000),
  negotiationMaxDecreasePct: z.number().min(0).max(50).optional(),
});

const matchDecisionSchema = z.object({
  match: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export const listingsRoutes = new Hono();

/// All listings, newest first. Used by /seller dashboard and admin views.
listingsRoutes.get('/', (c) => {
  return c.json({ listings: listAllListings() });
});

listingsRoutes.get('/mine', (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  return c.json({ listings: listListingsForSeller(parsed.data) });
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
    // Skip the user's own briefs — sellers shouldn't bid on themselves.
    const briefBuyerOwner = await findAgentWalletByAgentAddress(job.buyer);
    if (briefBuyerOwner?.userAddress === listing.sellerUser) {
      logger.info(
        { listingId: listing.id, jobId: job.jobId },
        'skipping own brief',
      );
      continue;
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
      continue;
    }

    logger.info(
      { listingId: listing.id, jobId: job.jobId, decision },
      'listing-brief match decision',
    );

    if (!decision.match || decision.confidence < 0.6) continue;

    // Price feasibility: if the seller's floor exceeds the buyer's ceiling there
    // is no number both sides would accept. Skip without bidding so the listing
    // stays open for other briefs and we don't waste an on-chain bid that's
    // guaranteed to be rejected during negotiation.
    const floor = listingFloor(listing);
    const buyerPct = (job as { negotiationMaxIncreasePct?: number }).negotiationMaxIncreasePct ?? 0;
    const buyerCeiling = Number(job.budgetUsdc) * (1 + buyerPct / 100);
    if (floor > buyerCeiling) {
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
      continue;
    }

    const result = await submitListingBid(
      job,
      seller,
      {
        askingPriceUsdc: listing.askingPriceUsdc,
        floorUsdc: floor,
        description: listing.description,
      },
    );
    if (result.ok) {
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
      // Listing consumed by the first feasible match. The seller can post
      // a new listing if they want to chase other briefs.
      return;
    }
  }
  logger.info({ listingId: listing.id }, 'no matching briefs found');
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
    'Decide if the brief and the listing describe the SAME service or deliverable.',
    'Match generously on synonyms and abbreviations (e.g. "WL" ≈ "whitelist", "ES→AR" ≈ "Spanish to Arabic").',
    'Match=true only if the listing\'s offer can clearly fulfill the brief. Price differences are OK — negotiation handles those.',
    '',
    'Output:',
    '- match: true | false',
    '- confidence: 0..1',
    '- reasoning: one sentence on why match=true or false',
  ].join('\n');
}

export { listOpenListings, listingFloor };
