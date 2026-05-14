import { startSellerAgents, backfillRecentJobs } from '../agents/seller.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main() {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for agent LLM scoring');
  }

  if (process.env.BACKFILL === '1') {
    await backfillRecentJobs();
  }

  const stop = startSellerAgents();

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'seller-agent crashed');
  process.exit(1);
});
