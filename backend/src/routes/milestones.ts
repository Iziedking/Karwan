import { Hono } from 'hono';
import { z } from 'zod';
import { readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_ACCEPTED } from '../chain/settlement.js';
import { findWalletIdForAgent } from '../agents/agent-registry.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { sessionAddress } from '../auth/session.js';
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

  // Releasing a milestone pays the seller. Only the human who owns the on-chain
  // buyer agent may trigger it. Resolve that owner from the funded escrow's
  // buyer address and require a matching session, so this internal settlement
  // route can't be driven by anyone who can reach the API.
  const buyerAgents = await findAgentWalletByAgentAddress(account.buyer);
  if (!buyerAgents) {
    return c.json({ error: 'no agent wallet on record for this job buyer' }, 409);
  }
  const caller = sessionAddress(c);
  if (!caller || caller !== buyerAgents.userAddress.toLowerCase()) {
    return c.json({ error: 'only the buyer can release this deal', code: 'forbidden' }, 403);
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
