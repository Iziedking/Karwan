import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as appLogger } from './logger.js';
import { config } from './config.js';
import { publicClient } from './chain/client.js';
import { jobsRoutes } from './routes/jobs.js';
import { agentsRoutes } from './routes/agents.js';
import { eventsRoutes } from './routes/events.js';
import { milestonesRoutes } from './routes/milestones.js';
import { balancesRoutes } from './routes/balances.js';
import { activityRoutes } from './routes/activity.js';
import { profileRoutes } from './routes/profile.js';
import { reputationRoutes } from './routes/reputation.js';
import { dealsRoutes } from './routes/deals.js';
import { activationRoutes } from './routes/activation.js';
import { bridgeRoutes, resumePendingBridges } from './routes/bridge.js';
import { chatRoutes } from './routes/chat.js';
import { telegramRoutes } from './routes/telegram.js';
import { adminRoutes } from './routes/admin.js';
import { listingsRoutes } from './routes/listings.js';
import {
  startBuyerAgents,
  backfillRecentJobs as backfillBuyer,
} from './agents/buyer.js';
import { startSellerAgents } from './agents/seller.js';
import { startDealWatcher } from './agents/dealWatcher.js';
import { startTelegramBot } from './telegram/bot.js';
import { startTelegramNotifier } from './telegram/notifier.js';
import { ensureSchema, pgEnabled } from './db/client.js';

const app = new Hono();

app.use('*', cors({ origin: (origin) => origin ?? '*', credentials: false }));

app.get('/', (c) => c.json({ name: 'karwan', status: 'ok' }));

app.get('/health', async (c) => {
  try {
    const [chainId, blockNumber] = await Promise.all([
      publicClient.getChainId(),
      publicClient.getBlockNumber(),
    ]);
    return c.json({
      status: 'ok',
      chain: { id: chainId, latestBlock: blockNumber.toString() },
    });
  } catch (err) {
    appLogger.error({ err }, 'health check failed');
    return c.json({ status: 'degraded', error: String(err) }, 503);
  }
});

app.route('/api/jobs', jobsRoutes);
app.route('/api/agents', agentsRoutes);
app.route('/api/events', eventsRoutes);
app.route('/api/milestones', milestonesRoutes);
app.route('/api/balances', balancesRoutes);
app.route('/api/activity', activityRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/bridge', bridgeRoutes);
app.route('/api/reputation', reputationRoutes);
app.route('/api/deals', dealsRoutes);
app.route('/api/activation', activationRoutes);
app.route('/api/chat', chatRoutes);
app.route('/api/telegram', telegramRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/listings', listingsRoutes);

process.on('unhandledRejection', (reason) => {
  appLogger.error({ reason: reason instanceof Error ? reason.message : String(reason) }, 'unhandled rejection');
});
process.on('uncaughtException', (err) => {
  appLogger.error({ err: err instanceof Error ? err.message : String(err) }, 'uncaught exception');
});

const stopFns: Array<() => void> = [];

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
  // Resume any bridge that burned but never minted, e.g. across a restart.
  resumePendingBridges().catch((err) =>
    appLogger.error({ err: (err as Error).message }, 'bridge resume failed'),
  );
}

void boot();

const port = config.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  appLogger.info({ port: info.port, env: config.NODE_ENV }, 'karwan backend listening');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    appLogger.info({ sig }, 'shutting down');
    stopFns.forEach((fn) => fn());
    process.exit(0);
  });
}

export { app };
