import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as appLogger } from './logger.js';
import { installProcessErrorHandlers } from './errorTracker.js';
import { config } from './config.js';
import { publicClient } from './chain/client.js';
import { invalidateEscrowCache } from './chain/contracts.js';
import { bus } from './events.js';
import { jobsRoutes } from './routes/jobs.js';
import { agentsRoutes } from './routes/agents.js';
import { eventsRoutes } from './routes/events.js';
import { milestonesRoutes } from './routes/milestones.js';
import { balancesRoutes } from './routes/balances.js';
import { activityRoutes } from './routes/activity.js';
import { profileRoutes } from './routes/profile.js';
import { settingsRoutes } from './routes/settings.js';
import { termsRoutes } from './routes/terms.js';
import { reputationRoutes } from './routes/reputation.js';
import { dealsRoutes } from './routes/deals.js';
import { cashoutRoutes } from './routes/cashout.js';
import { networkRoutes } from './routes/network.js';
import { activationRoutes } from './routes/activation.js';
import { vaultRoutes } from './routes/vault.js';
import { legacyRoutes } from './routes/legacy.js';
import { bridgeRoutes, resumePendingBridges } from './routes/bridge.js';
import { chatRoutes } from './routes/chat.js';
import { telegramRoutes } from './routes/telegram.js';
import { adminRoutes } from './routes/admin.js';
import { adminTreasuryRoutes } from './routes/adminTreasury.js';
import { yieldRoutes } from './routes/yield.js';
import { listingsRoutes } from './routes/listings.js';
import { xRoutes } from './routes/x.js';
import { authRoutes } from './routes/auth.js';
import { siweRoutes } from './routes/siwe.js';
import { tradeRoutes } from './routes/trade.js';
import { factoringRoutes } from './routes/factoring.js';
import { poFinancingRoutes } from './routes/poFinancing.js';
import { smeRoutes } from './routes/sme.js';
import { feedbackRoutes } from './routes/feedback.js';
import { circleWebhookRoutes } from './routes/circle-webhook.js';
import {
  startBuyerAgents,
  backfillRecentJobs as backfillBuyer,
} from './agents/buyer.js';
import { startSellerAgents } from './agents/seller.js';
import { startDealWatcher } from './agents/dealWatcher.js';
import { startFactoringWatcher } from './agents/factoringWatcher.js';
import { startJobExpiryWatcher } from './agents/jobExpiryWatcher.js';
import { startBalanceWatcher } from './chain/balanceWatcher.js';
import { startCooldownWatcher } from './chain/cooldownWatcher.js';
import { startVaultScanWatcher } from './chain/vaultScanCache.js';
import { backfillBusFromChain } from './chain/eventBackfill.js';
import { syncBridgeEventsToBus } from './chain/bridgeEventSync.js';
import { startReputationReconciler } from './reputation/reconciler.js';
import { startTelegramBot } from './telegram/bot.js';
import { startTelegramNotifier } from './telegram/notifier.js';
import { startXBroadcaster } from './notifiers/xBroadcaster.js';
import { ensureSchema, pgEnabled } from './db/client.js';

const app = new Hono();

// Session cookies need credentials:true, which forbids origin:*. We echo the
// request's Origin back when it's in the trusted set — defaults cover local
// dev; production deploys can extend by setting FRONTEND_BASE_URL.
const ALLOWED_ORIGINS = new Set<string>(
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    config.FRONTEND_BASE_URL?.replace(/\/$/, ''),
    config.WEBAUTHN_ORIGIN?.replace(/\/$/, ''),
  ].filter((x): x is string => !!x),
);

// Also accept any *.vercel.app preview/production URL for this project so
// we can test from the Vercel-issued domain when the custom domain isn't
// reachable from the operator's network.
const VERCEL_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (ALLOWED_ORIGINS.has(origin)) return origin;
      if (VERCEL_ORIGIN.test(origin)) return origin;
      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS', 'DELETE', 'PUT'],
    allowHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Admin-Token'],
  }),
);

app.get('/', (c) => c.json({ name: 'karwan', status: 'ok' }));

/// Health check serves the orchestrator: the only question it answers is
/// "is the API process up and able to serve HTTP requests?" Returning 503
/// when the chain is degraded turned a routine RPC quota exhaustion into a
/// deploy outage — the orchestrator marked the container unhealthy, CI
/// rolled back, and the previous image inherited the same downstream RPC
/// issues. The API itself is fine even when chain reads fail; routes that
/// need chain data already degrade gracefully with their own cached
/// snapshots and warning logs.
///
/// New behaviour: always return 200 with the API status. Chain reachability
/// is reported as a sibling field so dashboards can still surface degraded
/// chain state, but the container stays healthy and deploys land.
app.get('/health', async (c) => {
  /// Short timeout on the chain probe so a wedged RPC doesn't tie the
  /// orchestrator's health check up for its full window.
  const HEALTH_RPC_TIMEOUT_MS = 2500;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('chain-probe-timeout')), HEALTH_RPC_TIMEOUT_MS),
  );
  try {
    const [chainId, blockNumber] = await Promise.race([
      Promise.all([publicClient.getChainId(), publicClient.getBlockNumber()]),
      timeoutPromise,
    ]);
    return c.json({
      status: 'ok',
      chain: { id: chainId, latestBlock: blockNumber.toString(), reachable: true },
    });
  } catch (err) {
    /// Chain unreachable — usually RPC rate-limit, occasionally a transient
    /// network blip. Log it for dashboards but keep the API healthy.
    /// Surfaces / surfaces with their own cached snapshots keep working;
    /// surfaces that need live chain data show the warning state they
    /// already render for these errors.
    appLogger.warn({ err: String(err) }, 'health check: chain probe failed, API still healthy');
    return c.json({
      status: 'ok',
      chain: { reachable: false, error: String(err) },
    });
  }
});

app.route('/api/jobs', jobsRoutes);
app.route('/api/agents', agentsRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/milestones', milestonesRoutes);
app.route('/api/balances', balancesRoutes);
app.route('/api/activity', activityRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/bridge', bridgeRoutes);
app.route('/api/reputation', reputationRoutes);
app.route('/api/deals', dealsRoutes);
app.route('/api/cashout', cashoutRoutes);
app.route('/api/network', networkRoutes);
app.route('/api/activation', activationRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/legacy', legacyRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/telegram', telegramRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/admin/treasuries', adminTreasuryRoutes);
app.route('/api/yield', yieldRoutes);
app.route('/api/listings', listingsRoutes);
app.route('/api/terms', termsRoutes);
app.route('/api/x', xRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/siwe', siweRoutes);
// SME trade-finance rail (Phase 2 Track 2).
app.route('/api/trade', tradeRoutes);
app.route('/api/factoring', factoringRoutes);
app.route('/api/po-financing', poFinancingRoutes);
app.route('/api/sme', smeRoutes);
app.route('/api/feedback', feedbackRoutes);
app.route('/api/circle', circleWebhookRoutes);

// Process-wide error capture. Routes unhandled rejections + uncaught
// exceptions through `errorTracker` so they land in the ring buffer and
// emit a `system.error` event the activity feed picks up. We do NOT
// exit; watchers and SSE keep running so one bad task can't take the
// whole server down.
installProcessErrorHandlers();

const stopFns: Array<() => void> = [];

// Any event that mutates on-chain escrow state has to bust the readEscrow
// cache so the next read pulls fresh data instead of serving the stale tuple.
const ESCROW_MUTATING_EVENTS = new Set<string>([
  'escrow.funded',
  'escrow.milestone.released',
  'escrow.settled',
  'deal.disputed',
  'deal.cancelled',
]);
stopFns.push(
  bus.subscribe((e) => {
    if (ESCROW_MUTATING_EVENTS.has(e.type) && e.jobId) {
      invalidateEscrowCache(e.jobId);
    }
  }),
);

function bootAgents() {
  if (process.env.SKIP_AGENTS === '1') {
    appLogger.warn('SKIP_AGENTS=1, not starting buyer/seller agents');
    return;
  }
  if (!config.OPENROUTER_API_KEY) {
    appLogger.warn('OPENROUTER_API_KEY not set, agents will start but cannot score bids');
  }
  try {
    stopFns.push(startBuyerAgents());
    // Replay recent JobPosted events so the in-memory jobs map survives restarts.
    // Fire-and-forget; agents handle live events while the backfill catches up.
    backfillBuyer().catch((err) =>
      appLogger.warn({ err: (err as Error).message }, 'buyer backfill failed'),
    );
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'buyer agent not started');
  }
  try {
    stopFns.push(startSellerAgents());
    // Seller-side backfill is intentionally NOT called: replaying JobPosted
    // events causes seller agents to re-bid on jobs they already bid on, since
    // their activeBids map is wiped on restart but the chain still has the
    // original bid. Live events handle new jobs; old jobs the seller missed
    // during downtime stay missed.
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'seller agent not started');
  }
  try {
    stopFns.push(startDealWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'deal watcher not started');
  }
  try {
    stopFns.push(startFactoringWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'factoring watcher not started');
  }
  try {
    stopFns.push(startJobExpiryWatcher());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'job expiry watcher not started');
  }
  try {
    stopFns.push(startReputationReconciler());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'reputation reconciler not started',
    );
  }
  try {
    stopFns.push(startBalanceWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'balance watcher not started',
    );
  }
  try {
    stopFns.push(startCooldownWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'cooldown watcher not started',
    );
  }
  /// Boot prefetch + periodic refresh of the shared vault scan cache.
  /// Without this, each `/api/vault/positions` request did its own full
  /// positionId walk on chain. The watcher hydrates the cache from disk
  /// (the prior process's snapshot) and kicks off a fresh scan in the
  /// background, so the first reader after a restart serves warm.
  try {
    stopFns.push(startVaultScanWatcher());
  } catch (err) {
    appLogger.warn(
      { err: (err as Error).message },
      'vault scan watcher not started',
    );
  }
}

async function boot() {
  if (pgEnabled) {
    try {
      await ensureSchema();
    } catch (err) {
      appLogger.error(
        { err: (err as Error).message },
        'postgres schema init failed, check DATABASE_URL',
      );
    }
  } else {
    appLogger.warn('DATABASE_URL not set, using flat-file persistence (dev only)');
  }
  bootAgents();
  // Telegram bot + notifier: both no-op cleanly when TELEGRAM_BOT_TOKEN is unset.
  try {
    stopFns.push(startTelegramBot());
    stopFns.push(startTelegramNotifier());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'telegram not started');
  }
  // X broadcaster queues posts for users with a bound handle. The actual API
  // post is a follow-up; this just wires the subscription so the queue is
  // observable in the activity feed.
  try {
    stopFns.push(startXBroadcaster());
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'x broadcaster not started');
  }
  // Resume any bridge that burned but never minted, e.g. across a restart.
  resumePendingBridges().catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'bridge resume failed'),
  );
  /// One-shot replay of historical chain events into the bus when the disk
  /// snapshot (data/events.json) is missing or empty. Without this, a fresh
  /// deploy or VPS restore comes up with /activity showing zero events even
  /// though the chain has full history. Fire-and-forget: the boot path
  /// completes immediately, the replay populates the bus in the background,
  /// and the next /api/activity read after it finishes returns the seeded
  /// history. Skips itself if the bus already loaded from disk.
  ///
  /// FORCE_EVENT_BACKFILL=1 on the env bypasses the skip-guard and replays
  /// unconditionally. Use after a contract redeploy, after a VPS rebuild
  /// that left a stale data/events.json behind, or any time /activity shows
  /// zero on a chain that obviously has history. Safe to leave on; the
  /// replay dedupes by (type|jobId|ts) when injecting.
  const forceBackfill =
    (process.env.FORCE_EVENT_BACKFILL ?? '').toLowerCase() === '1' ||
    (process.env.FORCE_EVENT_BACKFILL ?? '').toLowerCase() === 'true';
  /// Hydrate the in-memory bus from Postgres before the chain replay
  /// decides whether to run. PG is the durable store; once we load the
  /// last HISTORY_CAPACITY events the boot-guard correctly skips the
  /// expensive chain scan unless the operator forces it. Without this
  /// step, a fresh container with an empty events.json would always
  /// trigger a full replay even though the DB has the data.
  await bus.hydrateFromPg().then(
    (added) =>
      appLogger.info({ added, total: bus.historyLength() }, 'bus hydrated from postgres'),
    (err) =>
      appLogger.warn({ err: (err as Error).message }, 'bus PG hydrate failed; using disk JSON'),
  );
  backfillBusFromChain({ force: forceBackfill }).catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'event backfill failed'),
  );
  /// Bring the bus in line with per-user bridge persistence. The bridge
  /// store survives events.json wipes, so without this the activity-page
  /// BRIDGE counter reads 0 while the per-user bridge history modal still
  /// shows every bridge the user made. Idempotent — the bus dedupes by
  /// (type|jobId|ts). Fire-and-forget; an empty bridge store is a no-op.
  syncBridgeEventsToBus().catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'bridge event sync failed'),
  );
}

void boot();

const port = config.PORT;
const server = serve({ fetch: app.fetch, port }, (info) => {
  appLogger.info({ port: info.port, env: config.NODE_ENV }, 'karwan backend listening');
});

// Bump Node's HTTP timeouts well above the worst-case Circle DCW path.
// The Circle bridge endpoint signs two on-chain calls back-to-back
// (approve + depositForBurn). Each takes 10-30s through Circle's API
// + RPC, so the combined response can comfortably exceed Node 20's
// default `headersTimeout` of 60s. Without these overrides, the socket
// closes before we send a response and the browser reports
// "Failed to fetch", even though the on-chain work actually completed.
//
// @hono/node-server's ServerType union includes HTTP/2 servers, which
// lack these properties. We're always on HTTP/1 (no http2 config), so
// narrow via a structural cast and set the overrides defensively.
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const httpServer = server as unknown as {
  headersTimeout?: number;
  requestTimeout?: number;
  timeout?: number;
};
if ('headersTimeout' in httpServer) httpServer.headersTimeout = FIFTEEN_MINUTES_MS;
if ('requestTimeout' in httpServer) httpServer.requestTimeout = FIFTEEN_MINUTES_MS;
if ('timeout' in httpServer) httpServer.timeout = FIFTEEN_MINUTES_MS;

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    appLogger.info({ sig }, 'shutting down');
    stopFns.forEach((fn) => fn());
    process.exit(0);
  });
}

export { app };
