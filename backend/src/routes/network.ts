import { Hono } from 'hono';
import { getNetworkStats } from '../chain/networkStats.js';

export const networkRoutes = new Hono();

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
