import { Hono } from 'hono';
import { z } from 'zod';
import { invalidateEscrowCache, readEscrow } from '../chain/contracts.js';
import { releaseMilestone, finalizeIfSettled, ESCROW_ACCEPTED } from '../chain/settlement.js';
import { findWalletIdForAgent } from '../agents/agent-registry.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { sessionAddress } from '../auth/session.js';
import { bus } from '../events.js';
import { appendActivity } from '../db/activityLog.js';
import { formatUsdcMicros } from '../money/model.js';
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

  // Both humans behind the two agent addresses, resolved once so the release
  // loop can write a ledger row per party. This route released milestones and
  // recorded NOTHING for anyone: the money left the buyer and reached the
  // seller with no entry in either transaction history.
  const sellerOwner = account.seller
    ? await findAgentWalletByAgentAddress(account.seller).catch(() => null)
    : null;

  inFlight.add(body.jobId);
  releaseLoop(
    body.jobId,
    body.totalMilestones,
    account.milestonesReleased,
    walletId,
    buyerAgents.userAddress,
    sellerOwner?.userAddress ?? null,
  ).finally(
    () => {
      inFlight.delete(body.jobId);
    },
  );

  return c.json({ accepted: true, jobId: body.jobId, totalMilestones: body.totalMilestones }, 202);
});

async function releaseLoop(
  jobId: string,
  total: number,
  startIndex: number,
  walletId: string,
  buyerOwner: string,
  sellerOwner: string | null,
) {
  for (let i = startIndex; i < total; i++) {
    try {
      // What the seller was actually paid, read off the contract either side of
      // the call rather than computed from the schedule. The rows this loop
      // writes are the only record of a managed release, and they carried no
      // amount and no tx hash: the buyer's history said "released milestone 2"
      // with a dash where the money should be, and the receipt they can share
      // had nothing to show. `released` is the escrow's cumulative seller
      // payout in USDC micros, so the difference is this milestone's payment.
      const before = await readEscrow(jobId);
      const txHash = await releaseMilestone(jobId, i, walletId);
      invalidateEscrowCache(jobId);
      const after = await readEscrow(jobId);
      const paidMicros = after.released - before.released;
      // A zero or negative difference means the read raced the chain. Recording
      // nothing is better than recording a wrong number on a receipt, and
      // releaseMilestone has already proved the counter advanced.
      const amountUsdc = paidMicros > 0n ? formatUsdcMicros(paidMicros) : undefined;
      const settled = i === total - 1;
      void appendActivity({
        address: buyerOwner,
        kind: 'release',
        summary: `Released milestone ${i + 1} on deal ${jobId} to the seller${settled ? ' (final release, deal settled)' : ''}`,
        params: { t: settled ? 'milestoneReleaseFinal' : 'milestoneRelease', n: String(i + 1), job: String(jobId) },
        ...(amountUsdc ? { amountUsdc } : {}),
        txHash,
        jobId,
        ...(sellerOwner ? { counterparty: sellerOwner.toLowerCase() } : {}),
      });
      if (sellerOwner) {
        void appendActivity({
          address: sellerOwner,
          kind: 'payout',
          summary: `Received payment for milestone ${i + 1} on deal ${jobId}${settled ? ' (final release, deal settled)' : ''}`,
          params: { t: settled ? 'dealPayoutFinal' : 'dealPayout', n: String(i + 1), job: String(jobId) },
          ...(amountUsdc ? { amountUsdc } : {}),
          txHash,
          jobId,
          counterparty: buyerOwner.toLowerCase(),
        });
      }
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
