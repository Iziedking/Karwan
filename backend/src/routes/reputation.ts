import { Hono } from 'hono';
import { z } from 'zod';
import { reputation } from '../chain/contracts.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

export const reputationRoutes = new Hono();

reputationRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  try {
    const [scores, score] = await Promise.all([
      reputation.read.scores([parsed.data as `0x${string}`]) as Promise<readonly [bigint, bigint, bigint]>,
      reputation.read.getReputationScore([parsed.data as `0x${string}`]) as Promise<bigint>,
    ]);
    const [successCount, disputedCount, failedCount] = scores;
    const total = Number(successCount + disputedCount + failedCount);
    return c.json({
      address: parsed.data,
      scoreBps: Number(score),
      successCount: Number(successCount),
      disputedCount: Number(disputedCount),
      failedCount: Number(failedCount),
      totalDeals: total,
    });
  } catch (err) {
    return c.json(
      { error: 'reputation read failed', detail: (err as Error).message },
      502,
    );
  }
});
