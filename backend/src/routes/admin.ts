import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import {
  listAllMatchProposals,
  getBuyerSnapshot,
  deleteBuyerJobsForBuyer,
} from '../agents/buyer.js';
import { deleteBriefsByPoster } from '../db/briefs.js';
import { deleteListingsBySeller } from '../db/listings.js';
import { deleteDealsInvolvingAddress, getDeal, patchDeal } from '../db/deals.js';
import { deleteMatchProposalsInvolvingAddress } from '../db/matchProposals.js';
import { deleteNearMissInvolvingAddress } from '../db/nearMiss.js';
import { recentErrors } from '../errorTracker.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/adminAuth.js';

export const adminRoutes = new Hono();

// Gate the entire admin surface behind the shared-secret token. Fail-closed:
// disabled until ADMIN_API_TOKEN is set.
adminRoutes.use('*', requireAdmin);

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
  const nearMisses = deleteNearMissInvolvingAddress(target);
  const buyerJobs = deleteBuyerJobsForBuyer(target);
  logger.info(
    { target, briefs, listings, deals, proposals, nearMisses, buyerJobs },
    'admin: reset-history executed',
  );
  return c.json({
    ok: true,
    address: target,
    removed: { briefs, listings, deals, proposals, nearMisses, buyerJobs },
  });
});

/// Surgical force-cancel for a single deal that's stuck off-chain (e.g.
/// orphaned by a contract redeploy, where the recorded acceptedAt no longer
/// maps to a Funded escrow on the current contract). Sets cancelledAt on the
/// off-chain record so the UI moves the deal into a terminal state. Does
/// NOT touch the chain — the deal was never actually funded on the live
/// contract anyway. Use sparingly; the on-chain path is always preferred.
adminRoutes.post('/deals/:jobId/force-cancel', async (c) => {
  const jobId = c.req.param('jobId');
  const deal = await getDeal(jobId);
  if (!deal) return c.json({ error: 'deal not found' }, 404);
  if (deal.cancelledAt) {
    return c.json({ ok: true, jobId, alreadyCancelled: true });
  }
  await patchDeal(jobId, { cancelledAt: Date.now() });
  logger.warn({ jobId, buyer: deal.buyer, seller: deal.seller }, 'admin: force-cancelled deal');
  return c.json({ ok: true, jobId, forced: true });
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

/// USDC is a 6-decimal ERC-20 on Arc; the USYC mock and oracle report price at
/// 8 decimals (1e8 = $1.00), matching a Chainlink USD feed.
const TREASURY_USDC_DECIMALS = 6;
const TREASURY_PRICE_SCALE = 100_000_000n; // 1e8

const erc20BalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const treasuryAbi = [
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'usyc', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'idleThreshold', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalReserves', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const oracleAbi = [
  { type: 'function', name: 'latestAnswer', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'int256' }] },
] as const;

/// KarwanTreasury reserves: liquid USDC, the USYC holding marked to the oracle
/// price, and total reserves. This is the Track 2 "protocol reserves earn yield"
/// surface: on testnet the USYC value drifts above the USYC token count as the
/// MockUSYC price ramps, which is the simulated yield. Reports configured:false
/// (not an error) until KARWAN_TREASURY_CONTRACT_ADDR is set after deploy.
adminRoutes.get('/treasury', async (c) => {
  const treasury = config.KARWAN_TREASURY_CONTRACT_ADDR as `0x${string}` | undefined;
  if (!treasury) {
    return c.json({
      configured: false,
      detail: 'KarwanTreasury not deployed (KARWAN_TREASURY_CONTRACT_ADDR unset).',
    });
  }
  try {
    const [usdcAddr, usycAddr, oracleAddr, idleThreshold, totalReserves] = await Promise.all([
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'usdc' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'usyc' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'oracle' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'idleThreshold' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'totalReserves' }),
    ]);

    const [usdcBal, usycBal, price] = await Promise.all([
      publicClient.readContract({
        address: usdcAddr as `0x${string}`,
        abi: erc20BalanceAbi,
        functionName: 'balanceOf',
        args: [treasury],
      }),
      publicClient.readContract({
        address: usycAddr as `0x${string}`,
        abi: erc20BalanceAbi,
        functionName: 'balanceOf',
        args: [treasury],
      }),
      publicClient.readContract({ address: oracleAddr as `0x${string}`, abi: oracleAbi, functionName: 'latestAnswer' }),
    ]);

    const usdcWei = usdcBal as bigint;
    const usycWei = usycBal as bigint;
    const priceWei = price as bigint; // 8 decimals
    // USYC marked to current price, in 6-decimal USDC terms.
    const usycValueWei = (usycWei * priceWei) / TREASURY_PRICE_SCALE;

    return c.json({
      configured: true,
      address: treasury,
      usdcBalanceUsdc: formatUnits(usdcWei, TREASURY_USDC_DECIMALS),
      usycBalance: formatUnits(usycWei, TREASURY_USDC_DECIMALS),
      usycValueUsdc: formatUnits(usycValueWei, TREASURY_USDC_DECIMALS),
      totalReservesUsdc: formatUnits(totalReserves as bigint, TREASURY_USDC_DECIMALS),
      idleThresholdUsdc: formatUnits(idleThreshold as bigint, TREASURY_USDC_DECIMALS),
      // Oracle price of USYC in USD, 8 decimals normalised to a plain number.
      usycPriceUsd: Number(priceWei) / 1e8,
      usyc: usycAddr,
      oracle: oracleAddr,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, treasury }, 'admin: treasury read failed');
    return c.json({ error: 'treasury read failed', detail: (err as Error).message }, 502);
  }
});
