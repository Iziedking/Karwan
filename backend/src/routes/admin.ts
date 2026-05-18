import { Hono } from 'hono';
import { z } from 'zod';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import {
  listAllMatchProposals,
  getBuyerSnapshot,
  deleteBuyerJobsForBuyer,
} from '../agents/buyer.js';
import { deleteBriefsByPoster } from '../db/briefs.js';
import { deleteListingsBySeller } from '../db/listings.js';
import { deleteDealsInvolvingAddress } from '../db/deals.js';
import { deleteMatchProposalsInvolvingAddress } from '../db/matchProposals.js';
import { recentErrors } from '../errorTracker.js';
import { logger } from '../logger.js';

export const adminRoutes = new Hono();

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

/// Wipes a single test wallet's off-chain pollution. Removes:
///   - Briefs they posted
///   - Listings they own
///   - DirectDeals where they're buyer or seller
///   - Match proposals on either side
///   - In-memory buyer-agent job states owned by them
///
/// On-chain reputation history (recordCompletion events on KarwanReputation)
/// is permanent and is NOT touched. The reputation engine's spam/cancel
/// rates feed off the records we just removed, so a fresh read after this
/// returns a clean composite score.
adminRoutes.post('/reset-history', async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const address =
    typeof body?.address === 'string'
      ? body.address
      : (c.req.query('address') ?? '');
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) {
    return c.json(
      { error: 'address required (body.address or ?address=)', detail: parsed.error.message },
      400,
    );
  }
  const target = parsed.data.toLowerCase();
  const briefs = deleteBriefsByPoster(target);
  const listings = deleteListingsBySeller(target);
  const deals = await deleteDealsInvolvingAddress(target);
  const proposals = await deleteMatchProposalsInvolvingAddress(target);
  const buyerJobs = deleteBuyerJobsForBuyer(target);
  logger.info(
    { target, briefs, listings, deals, proposals, buyerJobs },
    'admin: reset-history executed',
  );
  return c.json({
    ok: true,
    address: target,
    removed: { briefs, listings, deals, proposals, buyerJobs },
  });
});

/// Backend runtime errors captured by the process-wide tracker. Returns up
/// to 100 entries from the in-memory ring buffer, newest first. Used by
/// the operator to triage runtime health without grepping pino logs.
adminRoutes.get('/errors', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? 50) || 50));
  return c.json({ errors: recentErrors(limit) });
});

/// Read-only marketplace view: every activated user, their agent addresses, and
/// the profile they registered (buyer side, seller side, or both). Powers the
/// `karwan view agents` CLI and is useful for debugging "why did this seller
/// bid?" questions.
adminRoutes.get('/agents', async (c) => {
  const wallets = await listAllAgentWallets();
  const out = await Promise.all(
    wallets.map(async (w) => {
      const profile = await getProfile(w.userAddress);
      return {
        userAddress: w.userAddress,
        displayName: profile?.displayName ?? null,
        role: profile?.role ?? null,
        buyerAgent: w.buyerAddress,
        sellerAgent: w.sellerAddress,
        seller: profile?.seller ?? null,
        buyer: profile?.buyer ?? null,
        activatedAt: w.createdAt,
      };
    }),
  );
  return c.json({ users: out.sort((a, b) => b.activatedAt - a.activatedAt) });
});

/// All match proposals across every job, newest first. Backed by Postgres
/// when DATABASE_URL is set, flat-file otherwise — survives restarts so the
/// admin view is consistent with what users see on the approve banner.
adminRoutes.get('/proposals', async (c) => {
  return c.json({ proposals: await listAllMatchProposals() });
});

/// Tracked agent jobs across all users, with their bids. Mirrors
/// /api/agents/buyer but with no address filter.
adminRoutes.get('/jobs', (c) => {
  return c.json(getBuyerSnapshot());
});
