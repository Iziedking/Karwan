import { Hono } from 'hono';
import { z } from 'zod';
import { readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_ACCEPTED } from '../chain/settlement.js';
import { findWalletIdForAgent } from '../agents/agent-registry.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

const releaseSchema = z.object({
  jobId: z.string().startsWith('0x'),
  totalMilestones: z.number().int().min(1).max(4).default(2),
});

const inFlight = new Set<string>();

export const milestonesRoutes = new Hono();

milestonesRoutes.post('/release', async (c) => {
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
  if (account.state !== ESCROW_ACCEPTED) {
    return c.json(
      { error: `escrow state must be Accepted(2), got ${account.state}. Releases run after the seller accepts the escrow.` },
      409,
    );
  }

  // Managed deals settle through the buyer agent that funded the escrow.
  const walletId = await findWalletIdForAgent(account.buyer);
  if (!walletId) {
    return c.json({ error: 'no agent wallet on record for this job buyer' }, 409);
  }

  inFlight.add(body.jobId);
  releaseLoop(body.jobId, body.totalMilestones, account.milestonesReleased, walletId).finally(
    () => {
      inFlight.delete(body.jobId);
    },
  );

  return c.json({ accepted: true, jobId: body.jobId, totalMilestones: body.totalMilestones }, 202);
});

async function releaseLoop(jobId: string, total: number, startIndex: number, walletId: string) {
  for (let i = startIndex; i < total; i++) {
    try {
      await releaseMilestone(jobId, i, walletId);
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
  // v2.D: finalizeIfSettled doesn't need a wallet anymore; the escrow's
  // own release call recorded reputation atomically on chain.
  await finalizeIfSettled(jobId);
}
