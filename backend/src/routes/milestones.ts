import { Hono } from 'hono';
import { z } from 'zod';
import { config } from '../config.js';
import { escrow } from '../chain/contracts.js';
import { executeContractCall } from '../chain/txs.js';
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

  const account = (await escrow.read.escrows([body.jobId as `0x${string}`])) as readonly [
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    number,
    number,
  ];
  const [, , , , milestonesReleased, state] = account;
  if (state !== 1) {
    return c.json({ error: `escrow state must be Funded(1), got ${state}` }, 409);
  }

  inFlight.add(body.jobId);
  releaseLoop(body.jobId, body.totalMilestones, milestonesReleased).finally(() => {
    inFlight.delete(body.jobId);
  });

  return c.json({ accepted: true, jobId: body.jobId, totalMilestones: body.totalMilestones }, 202);
});

async function releaseLoop(jobId: string, total: number, startIndex: number) {
  for (let i = startIndex; i < total; i++) {
    try {
      const result = await executeContractCall(
        {
          walletId: config.BUYER_AGENT_WALLET_ID!,
          contractAddress: escrow.address,
          abiFunctionSignature: 'releaseProgress(bytes32,uint8)',
          abiParameters: [jobId, i.toString()],
        },
        `releaseProgress(${jobId}, ${i})`,
      );
      bus.emitEvent({
        type: 'escrow.milestone.released',
        jobId,
        actor: 'buyer',
        payload: { milestoneIndex: i, txHash: result.txHash, totalMilestones: total },
      });
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
  bus.emitEvent({
    type: 'escrow.settled',
    jobId,
    actor: 'buyer',
    payload: { milestonesReleased: total },
  });
}
