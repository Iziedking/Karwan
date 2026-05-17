import { Hono } from 'hono';
import { z } from 'zod';
import { reputation } from '../chain/contracts.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

export const reputationRoutes = new Hono();

/// Composite reputation read. Returns the new engine output plus the legacy
/// `scoreBps` field so any UI still consuming the old shape keeps working
/// while frontend migrates to `score`/`tier`/`terms`.
reputationRoutes.get('/', async (c) => {
  const address = c.req.query('address');
  if (!address) return c.json({ error: 'address query param required' }, 400);
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) return c.json({ error: 'invalid address' }, 400);

  try {
    const inputs = await loadInputs(parsed.data);
    const result = compute(inputs);

    // Legacy basis-points score read straight off chain. Kept in the response
    // until the frontend reputation badge fully migrates to `score`/`tier`.
    let scoreBps = 5000;
    try {
      const raw = (await reputation.read.getReputationScore([
        parsed.data as `0x${string}`,
      ])) as bigint;
      scoreBps = Number(raw);
    } catch {
      // Fall back to neutral 5000 if the legacy view reverts on this address.
    }

    return c.json({
      address: result.address,
      score: result.score,
      tier: result.tier,
      terms: result.terms,
      inputs: result.inputs,
      modelVersion: result.modelVersion,

      // Legacy fields. Mirrors the v1 response shape so old callers don't break.
      scoreBps,
      successCount: result.inputs.successCount,
      disputedCount: result.inputs.disputedCount,
      failedCount: result.inputs.failedCount,
      totalDeals:
        result.inputs.successCount +
        result.inputs.disputedCount +
        result.inputs.failedCount,
    });
  } catch (err) {
    return c.json(
      { error: 'reputation read failed', detail: (err as Error).message },
      502,
    );
  }
});
