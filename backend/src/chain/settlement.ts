import { config } from '../config.js';
import { escrow, reputation, readEscrow } from './contracts.js';
import { executeContractCall } from './txs.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';

// KarwanReputation.Outcome enum: None=0, Success=1, DisputeResolved=2, Failed=3.
const OUTCOME_SUCCESS = 1;
// KarwanEscrow.EscrowState enum: None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
export const ESCROW_FUNDED = 1;
export const ESCROW_SETTLED = 2;

/// Releases a single milestone via the buyer agent wallet and emits the event.
/// Returns the tx hash.
export async function releaseMilestone(jobId: string, index: number): Promise<string> {
  if (!config.BUYER_AGENT_WALLET_ID) {
    throw new Error('BUYER_AGENT_WALLET_ID not configured');
  }
  const result = await executeContractCall(
    {
      walletId: config.BUYER_AGENT_WALLET_ID,
      contractAddress: escrow.address,
      abiFunctionSignature: 'releaseProgress(bytes32,uint8)',
      abiParameters: [jobId, index.toString()],
    },
    `releaseProgress(${jobId}, ${index})`,
  );
  bus.emitEvent({
    type: 'escrow.milestone.released',
    jobId,
    actor: 'buyer',
    payload: { milestoneIndex: index, txHash: result.txHash },
  });
  return result.txHash;
}

/// Reads the escrow on chain; if it has reached the Settled state, emits the
/// settled event and records reputation. Safe to call after any release.
export async function finalizeIfSettled(jobId: string): Promise<boolean> {
  const account = await readEscrow(jobId);
  if (account.state !== ESCROW_SETTLED) return false;
  bus.emitEvent({
    type: 'escrow.settled',
    jobId,
    actor: 'buyer',
    payload: {
      sellerTotalWei: account.released.toString(),
      feeTotalWei: account.feeReleased.toString(),
    },
  });
  await recordReputation(jobId);
  return true;
}

/// Records a successful completion on the reputation registry. Idempotent: the
/// contract locks one record per jobId, and we skip if already recorded.
export async function recordReputation(jobId: string): Promise<void> {
  if (!config.BUYER_AGENT_WALLET_ID) return;
  try {
    const { buyer, seller } = await readEscrow(jobId);
    const alreadyRecorded = (await reputation.read.recorded([
      jobId as `0x${string}`,
    ])) as boolean;
    if (alreadyRecorded) {
      logger.info({ jobId }, 'reputation already recorded for this job');
      return;
    }

    const result = await executeContractCall(
      {
        walletId: config.BUYER_AGENT_WALLET_ID,
        contractAddress: reputation.address,
        abiFunctionSignature: 'recordCompletion(bytes32,address,address,uint8)',
        abiParameters: [jobId, buyer, seller, OUTCOME_SUCCESS.toString()],
      },
      `recordCompletion(${jobId}, success)`,
    );
    bus.emitEvent({
      type: 'reputation.recorded',
      jobId,
      actor: 'buyer',
      payload: { subject: seller, rater: buyer, outcome: 'success', txHash: result.txHash },
    });
    logger.info({ jobId, seller, txHash: result.txHash }, 'reputation recorded for seller');
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'reputation record failed');
    bus.emitEvent({
      type: 'agent.error',
      jobId,
      actor: 'buyer',
      payload: { scope: 'recordCompletion', message: (err as Error).message },
    });
  }
}
