import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { z } from 'zod';
import { resolveBuyerProfileForUser, resolveSellerProfile } from '../agents/agent-registry.js';
import { readUsdcBalance } from '../chain/contracts.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { findBriefBySeedKey } from '../db/briefs.js';
import { cancelListing, createListing, findListingBySeedKey, listOpenListings } from '../db/listings.js';
import { getUserByEmail } from '../db/users.js';
import { logger } from '../logger.js';
import { buildSeedPlan } from '../marketplace/marketSeed/plan.js';
import { isSeedKey, requestStop, runSeed, seedStatus, type SeedAccount, type SeedDeps } from '../marketplace/marketSeed/runner.js';
import { postManagedJob } from '../marketplace/postManagedJob.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { invalidBodyMessage } from './invalidBody.js';
import { accountTypeOf, deriveLane } from '../profile/accountType.js';

///   POST /api/admin/market-seed/plan   { emails }            dry run: readiness and counts, writes nothing
///   POST /api/admin/market-seed/apply  { emails, confirm }   starts the run in the background
///   GET  /api/admin/market-seed/status                       progress of the current or last run
///   POST /api/admin/market-seed/stop                         stops after the item in flight
///   POST /api/admin/market-seed/unseed { confirm }           cancels every open seeded offer
/// Testnet only: the team's own accounts, paid with test USDC.

export const adminMarketSeedRoutes = new Hono();
adminMarketSeedRoutes.use('*', requireAdmin);
adminMarketSeedRoutes.use('*', async (c, next) => {
  if (config.ARC_NETWORK === 'mainnet') return c.json({ error: 'market seeding is testnet only', code: 'testnet_only' }, 403);
  await next();
});

const USDC_DECIMALS = 6;
const OFFER_TTL_DAYS = 30;
const OFFER_NEGOTIATION_PCT = 10;
const emailsSchema = z.object({ emails: z.array(z.string().email()).min(1).max(5) });

type LiveAccount = SeedAccount & { accountType: Awaited<ReturnType<typeof accountTypeOf>> };

async function resolveAccount(email: string): Promise<LiveAccount | { missing: string }> {
  const user = getUserByEmail(email);
  if (!user) return { missing: 'no testnet account for this email' };
  const agents = await getAgentWallets(user.address);
  if (!agents) return { missing: 'agents not activated' };
  const [seller, buyer, accountType] = await Promise.all([
    resolveSellerProfile(agents.sellerAddress),
    resolveBuyerProfileForUser(user.address),
    accountTypeOf(user.address),
  ]);
  return { address: user.address, sellerAgent: agents.sellerAddress, sellerReady: !!seller, buyerReady: !!buyer, accountType };
}

const liveDeps: SeedDeps = {
  resolveAccount,
  offerExists: (seedKey) => !!findListingBySeedKey(seedKey),
  createOffer: (account, offer) => {
    const accountType = (account as LiveAccount).accountType;
    createListing({
      seedKey: offer.seedKey,
      sellerUser: account.address,
      sellerAgent: account.sellerAgent,
      title: offer.title,
      description: offer.description,
      askingPriceUsdc: offer.askingPriceUsdc,
      negotiationMaxDecreasePct: OFFER_NEGOTIATION_PCT,
      ttlDays: OFFER_TTL_DAYS,
      tradeLane: deriveLane(accountType),
      partyKind: accountType,
    });
  },
  requestExists: (seedKey) => !!findBriefBySeedKey(seedKey),
  postRequest: async (account, request) => {
    const result = await postManagedJob(
      { posterAddress: account.address, brief: request.brief, budgetUsdc: request.budgetUsdc, deadlineDays: request.deadlineDays },
      { seedKey: request.seedKey },
    );
    if (result.ok) return { ok: true };
    const code = typeof result.body.code === 'string' ? result.body.code : String(result.body.error ?? 'failed');
    return { ok: false, reason: code === 'FUND_BUYER_AGENT' ? 'buyer agent balance too low' : code };
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

adminMarketSeedRoutes.post('/plan', async (c) => {
  let body;
  try {
    body = emailsSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const plan = buildSeedPlan(body.emails);
  const accounts = await Promise.all(
    plan.map(async (a) => {
      const resolved = await resolveAccount(a.email);
      const items = [...a.offers, ...a.requests];
      const present = items.filter((i) => (i.kind === 'offer' ? liveDeps.offerExists(i.seedKey) : liveDeps.requestExists(i.seedKey))).length;
      const largestBudget = Math.max(...a.requests.map((r) => r.budgetUsdc));
      let buyerAgentUsdc: string | null = null;
      if (!('missing' in resolved)) {
        const agents = await getAgentWallets(resolved.address);
        buyerAgentUsdc = agents ? formatUnits(await readUsdcBalance(agents.buyerAddress).catch(() => 0n), USDC_DECIMALS) : null;
      }
      return {
        account: a.account,
        specialties: a.specialties,
        ready: 'missing' in resolved ? false : resolved.sellerReady && resolved.buyerReady,
        ...('missing' in resolved ? { missing: resolved.missing } : { sellerReady: resolved.sellerReady, buyerReady: resolved.buyerReady }),
        offers: a.offers.length,
        requests: a.requests.length,
        alreadyPresent: present,
        buyerAgentUsdc,
        largestRequestBudgetUsdc: largestBudget,
      };
    }),
  );
  return c.json({ mode: 'dry-run', accounts, status: seedStatus() });
});

adminMarketSeedRoutes.post('/apply', async (c) => {
  let body;
  try {
    body = emailsSchema.extend({ confirm: z.literal('SEED_TESTNET') }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  if (seedStatus().state === 'running') return c.json({ error: 'a run is already in progress', status: seedStatus() }, 409);
  const plan = buildSeedPlan(body.emails);
  runSeed(plan, liveDeps)
    .then((s) => logger.info({ created: s.created, failed: s.failed, state: s.state }, 'market seed finished'))
    .catch((err) => logger.error({ err: (err as Error).message }, 'market seed crashed'));
  return c.json({ started: true, status: seedStatus() }, 202);
});

adminMarketSeedRoutes.get('/status', (c) => c.json(seedStatus()));

adminMarketSeedRoutes.post('/stop', (c) => {
  requestStop();
  return c.json({ stopping: true, status: seedStatus() });
});

adminMarketSeedRoutes.post('/unseed', async (c) => {
  try {
    z.object({ confirm: z.literal('UNSEED_TESTNET') }).parse(await c.req.json());
  } catch (err) {
    return c.json({ error: invalidBodyMessage(err) }, 400);
  }
  const seeded = listOpenListings().filter((l) => isSeedKey(l.seedKey));
  for (const l of seeded) cancelListing(l.id);
  return c.json({ cancelledOffers: seeded.length });
});
