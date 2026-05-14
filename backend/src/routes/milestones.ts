import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_FUNDED } from '../chain/settlement.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const releaseSchema = z.object({
  jobId: z.string().startsWith('0x'),
  totalMilestones: z.number().int().min(1).max(4).default(2),
});

const inFlight = new Set<string>();

export const milestonesRoutes = new Hono();

milestonesRoutes.post('/release', async (c) => {
  if (!config.BUYER_AGENT_WALLET_ID) {
    return c.json({ error: 'BUYER_AGENT_WALLET_ID not configured' }, 500);
  }

  let body;
  try {
    body = releaseSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: 'invalid body', detail: (err as Error).message }, 400);
  }

  if (inFlight.has(body.jobId)) {
    return c.json({ accepted: false, reason: 'release already in progress for this job' }, 409);
  }

  const account = await readEscrow(body.jobId);
  if (account.state !== ESCROW_FUNDED) {
    return c.json({ error: `escrow state must be Funded(1), got ${account.state}` }, 409);
  }

  inFlight.add(body.jobId);
  releaseLoop(body.jobId, body.totalMilestones, account.milestonesReleased).finally(() => {
    inFlight.delete(body.jobId);
  });

  return c.json({ accepted: true, jobId: body.jobId, totalMilestones: body.totalMilestones }, 202);
});

async function releaseLoop(jobId: string, total: number, startIndex: number) {
  for (let i = startIndex; i < total; i++) {
    try {
      await releaseMilestone(jobId, i);
    } catch (err) {
      logger.error({ jobId, i, err: (err as Error).message }, 'release failed');
      bus.emitEvent({
        type: 'agent.error',
        jobId,
        actor: 'buyer',
        payload: { scope: 'releaseProgress', milestoneIndex: i, message: (err as Error).message },
      });
      return;
    }
  }
  await finalizeIfSettled(jobId);
}
