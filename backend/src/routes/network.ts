import { Hono } from 'hono';
import { getNetworkStats } from '../chain/networkStats.js';
import { config } from '../config.js';

export const networkRoutes = new Hono();

/// The published dispute/recovery timelines, read straight from the live
/// config the watcher actually enforces. Public: the docs page renders these
/// so the process users see IS the process the platform runs — no drift
/// between policy copy and behavior.
networkRoutes.get('/dispute-policy', (c) =>
  c.json({
    reviewWindowMs: config.DEAL_REVIEW_WINDOW_MS,
    delayAppealGraceMs: config.DEAL_DELAY_APPEAL_GRACE_MS,
    delayAppealResponseMs: config.DEAL_DELAY_APPEAL_RESPONSE_MS,
    deadlineReclaimGraceMs: config.DEAL_DEADLINE_RECLAIM_GRACE_MS,
    disputeTimeoutMs: config.DEAL_DISPUTE_TIMEOUT_MS,
  }),
);

/// Provable on-chain stats derived from current contract events. Cached
/// server-side; `?fresh=1` rebuilds the snapshot. Numeric volume fields are
/// strings (USDC at 6 decimals) so the JSON survives precision loss.
networkRoutes.get('/onchain', async (c) => {
  const fresh = c.req.query('fresh') === '1';
  try {
    const stats = await getNetworkStats(fresh);
    return c.json(stats);
  } catch (err) {
    return c.json(
      { error: 'network stats unavailable', detail: (err as Error).message },
      502,
    );
  }
});
