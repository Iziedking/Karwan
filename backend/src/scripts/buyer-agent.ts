import { startBuyerAgent, backfillRecentJobsForBuyer } from '../agents/buyer.js';
import { loadBuyerProfile } from '../agents/buyer-profile.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

async function main() {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required for agent LLM scoring');
  }

  const buyer = loadBuyerProfile();

  if (process.env.BACKFILL === '1') {
    await backfillRecentJobsForBuyer(buyer);
  }

  const stop = startBuyerAgent(buyer);

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      logger.info({ sig }, 'shutting down');
      stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : err }, 'buyer-agent crashed');
  process.exit(1);
});
