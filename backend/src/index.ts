import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as appLogger } from './logger.js';
import { config } from './config.js';
import { publicClient } from './chain/client.js';

const app = new Hono();

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

const port = config.PORT;
serve({ fetch: app.fetch, port }, (info) => {
  appLogger.info({ port: info.port, env: config.NODE_ENV }, 'karwan backend listening');
});

export { app };
