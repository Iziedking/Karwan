import { Hono } from 'hono';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import { listAllMatchProposals, getBuyerSnapshot } from '../agents/buyer.js';

export const adminRoutes = new Hono();

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
