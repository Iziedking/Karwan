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
import { bridgeRoutes } from './routes/bridge.js';
import { startBuyerAgent } from './agents/buyer.js';
import { startSellerAgent } from './agents/seller.js';
import { loadBuyerProfile } from './agents/buyer-profile.js';
import { loadSellerProfile } from './agents/seller-profile.js';

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
    appLogger.warn('OPENROUTER_API_KEY not set — agents will start but cannot score bids');
  }
  try {
    const buyer = loadBuyerProfile();
    stopFns.push(startBuyerAgent(buyer));
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'buyer agent not started');
  }
  try {
    const seller = loadSellerProfile();
    stopFns.push(startSellerAgent(seller));
  } catch (err) {
    appLogger.warn({ err: (err as Error).message }, 'seller agent not started');
  }
}

bootAgents();

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
