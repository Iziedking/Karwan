import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { getAgentWallets, listAllAgentWallets } from '../db/agentWallets.js';
import { listAllDeals } from '../db/deals.js';
import { reputation } from '../chain/contracts.js';
import { getProfile } from '../db/profiles.js';
import {
  listAllMatchProposals,
  getBuyerSnapshot,
  deleteBuyerJobsForBuyer,
} from '../agents/buyer.js';
import { deleteBriefsByPoster } from '../db/briefs.js';
import { deleteListingsBySeller } from '../db/listings.js';
import {
  deleteDealsInvolvingAddress,
  getDeal,
  patchDeal,
} from '../db/deals.js';
import { reconcileReputationOnce } from '../reputation/reconciler.js';
import { backfillBusFromChain } from '../chain/eventBackfill.js';
import { eventHistoryCount } from '../events.js';
import { deleteMatchProposalsInvolvingAddress } from '../db/matchProposals.js';
import { deleteNearMissInvolvingAddress } from '../db/nearMiss.js';
import { recentErrors } from '../errorTracker.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { screenCounterparty, externalPayerAddress } from '../x402/externalClient.js';

export const adminRoutes = new Hono();

// Gate the entire admin surface behind the shared-secret token. Fail-closed:
// disabled until ADMIN_API_TOKEN is set.
adminRoutes.use('*', requireAdmin);

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

/// Smoke test for the Base mainnet external x402 rail: screens any EVM
/// address through GlobalAPI's counterparty check ($0.01, real USDC from
/// the payer wallet). Also reports the payer address so the operator
/// knows where to send funding.
adminRoutes.get('/x402/screen/:address', async (c) => {
  const parsed = addrSchema.safeParse(c.req.param('address'));
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);
  try {
    const result = await screenCounterparty(parsed.data);
    return c.json(result);
  } catch (err) {
    return c.json(
      {
        error: 'screen failed',
        detail: (err as Error).message,
        payer: externalPayerAddress(),
      },
      502,
    );
  }
});

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
/// NOT touch the chain. The deal was never actually funded on the live
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

/// Replays settled deals onto the on-chain KarwanReputation registry.
/// Necessary because the recordCompletion mirror is a best-effort call that
/// can fail silently (network blip, redeployed contract, deals settled
/// without a buyerAgentWalletId). When the chain has fewer recorded
/// completions than the DB has settledAt rows, the credit-passport score
/// understates a real history.
///
/// Note: the same reconciler runs on a 10-minute periodic loop wired in
/// index.ts, so future silent failures self-heal without operator action.
/// This endpoint is for ad-hoc recovery (post-redeploy bulk replay, manual
/// triage when an operator wants to see the result immediately) and dry
/// runs. Pass ?address=0x... to limit scope, ?dry=1 to report without
/// sending txs.
adminRoutes.post('/reputation/backfill', async (c) => {
  const filterAddrRaw = c.req.query('address');
  const filterAddr = filterAddrRaw?.toLowerCase() ?? null;
  if (filterAddr && !addrSchema.safeParse(filterAddr).success) {
    return c.json({ error: 'invalid address filter' }, 400);
  }
  const dryRun = c.req.query('dry') === '1';

  const result = await reconcileReputationOnce({
    addressFilter: filterAddr,
    dryRun,
  });

  logger.info(
    {
      filterAddr,
      dryRun,
      candidates: result.candidates,
      recorded: result.recorded.length,
      alreadyOnChain: result.alreadyOnChain.length,
      failed: result.failed.length,
      skipped: result.skipped.length,
    },
    'admin: reputation backfill complete',
  );

  return c.json({
    ok: true,
    dryRun,
    filterAddr,
    ...result,
  });
});

/// Force-replay the chain event backfill into the in-memory bus + persisted
/// data/events.json. Fire-and-forget, the route returns 202 immediately
/// and the scan runs in the background. A synchronous run was prone to
/// reverse-proxy timeouts on a wide lookback window (Caddy default is 5
/// min, the scan can legitimately take 10+ min with slowed concurrency
/// against free-tier RPC). Poll GET /api/admin/events/backfill/status to
/// see progress + the final result. Last result is kept in-memory until
/// the next run replaces it.
let backfillRunning = false;
let lastBackfillResult: {
  startedAt: number;
  completedAt?: number;
  ok: boolean;
  scanned?: number;
  injected?: number;
  chunkErrors?: number;
  /// Rows in the event_history table read right after the backfill persisted.
  /// This is the durability check: if `injected` is high but `durable` is 0,
  /// the events only reached the in-memory ring and will vanish on restart
  /// (the symptom is the activity feed reading empty after a redeploy).
  durable?: number | null;
  error?: string;
} | null = null;

adminRoutes.post('/events/backfill', (c) => {
  if (backfillRunning) {
    return c.json(
      {
        ok: false,
        running: true,
        startedAt: lastBackfillResult?.startedAt ?? null,
        detail: 'a backfill is already running; poll /status for progress',
      },
      409,
    );
  }
  backfillRunning = true;
  lastBackfillResult = { startedAt: Date.now(), ok: false };
  /// Kick the scan in the background. The route returns 202 immediately
  /// so the operator's curl never hits a proxy timeout.
  void (async () => {
    try {
      const result = await backfillBusFromChain({ force: true });
      // Read the durable row count so the status endpoint can prove the events
      // actually persisted to event_history, not just the in-memory ring. The
      // bulk insert is fire-and-forget; a short pause lets it settle first.
      await new Promise((r) => setTimeout(r, 1500));
      const durable = await eventHistoryCount();
      lastBackfillResult = {
        ...(lastBackfillResult ?? { startedAt: Date.now() }),
        completedAt: Date.now(),
        ok: true,
        scanned: result.scanned,
        injected: result.injected,
        chunkErrors: result.chunkErrors,
        durable,
      };
      logger.info({ ...result, durable }, 'admin: event backfill forced (async complete)');
    } catch (err) {
      const msg = (err as Error).message ?? 'unknown';
      lastBackfillResult = {
        ...(lastBackfillResult ?? { startedAt: Date.now() }),
        completedAt: Date.now(),
        ok: false,
        error: msg,
      };
      logger.error({ err: msg }, 'admin: event backfill threw (async)');
    } finally {
      backfillRunning = false;
    }
  })();
  return c.json(
    {
      ok: true,
      running: true,
      startedAt: lastBackfillResult.startedAt,
      detail: 'backfill started in background; poll /api/admin/events/backfill/status',
    },
    202,
  );
});

/// Status of the most-recent (or currently-running) admin backfill. Returns
/// { running, ok, scanned, injected, chunkErrors, startedAt, completedAt }
/// or { running: false, ok: null } when no backfill has run since boot.
adminRoutes.get('/events/backfill/status', (c) => {
  if (!lastBackfillResult) {
    return c.json({ running: false, ok: null });
  }
  return c.json({ running: backfillRunning, ...lastBackfillResult });
});

/// Backend runtime errors captured by the process-wide tracker. Returns up
/// to 100 entries from the in-memory ring buffer, newest first. Used by
/// the operator to triage runtime health without grepping pino logs.
adminRoutes.get('/errors', (c) => {
  const limitParam = c.req.query('limit');
  const limit = Math.min(100, Math.max(1, Number(limitParam ?? 50) || 50));
  return c.json({ errors: recentErrors(limit) });
});

/// Diagnostic: full reputation read for one address. Surfaces the three
/// chain targets (identity + buyer agent + seller agent) with the raw
/// `scores` triple from KarwanReputation per target, plus the DB-side
/// deal counts (settled / cancelled) for the same identity. Lets us
/// answer "did the wallet just never settle, or did recordCompletion
/// silently fail?" without grepping logs.
adminRoutes.get('/reputation-debug', async (c) => {
  const address = (c.req.query('address') ?? '').toLowerCase();
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'bad address' }, 400);

  const wallets = await getAgentWallets(address).catch(() => null);
  const targets: { label: string; address: string }[] = [
    { label: 'identity', address },
  ];
  if (wallets?.buyerAddress) targets.push({ label: 'buyerAgent', address: wallets.buyerAddress });
  if (wallets?.sellerAddress) targets.push({ label: 'sellerAgent', address: wallets.sellerAddress });

  const chainScores = await Promise.all(
    targets.map(async (t) => {
      try {
        const s = (await reputation.read.scores([t.address as `0x${string}`])) as readonly [
          bigint,
          bigint,
          bigint,
        ];
        return {
          label: t.label,
          address: t.address,
          successCount: Number(s[0]),
          disputedCount: Number(s[1]),
          failedCount: Number(s[2]),
        };
      } catch (err) {
        return { label: t.label, address: t.address, error: (err as Error).message };
      }
    }),
  );

  const allDeals = await listAllDeals();
  const involved = allDeals.filter(
    (d) => d.buyer?.toLowerCase() === address || d.seller?.toLowerCase() === address,
  );
  const dbSettled = involved.filter((d) => !!d.settledAt);
  const dbCancelled = involved.filter((d) => !!d.cancelledAt);

  return c.json({
    address,
    wallets: wallets ?? null,
    chainScores,
    db: {
      totalInvolved: involved.length,
      settledCount: dbSettled.length,
      cancelledCount: dbCancelled.length,
      settledSample: dbSettled.slice(0, 5).map((d) => ({
        jobId: d.jobId,
        role: d.buyer?.toLowerCase() === address ? 'buyer' : 'seller',
        buyer: d.buyer,
        seller: d.seller,
        settledAt: d.settledAt,
        dealAmountUsdc: d.dealAmountUsdc,
      })),
    },
  });
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
/// when DATABASE_URL is set, flat-file otherwise. Survives restarts so the
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
/// surface: the USYC value drifts above the USYC token count as the USYC oracle
/// price ramps, which is the yield. Reports configured:false
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
