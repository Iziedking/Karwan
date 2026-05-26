import { escrow, reputation, readEscrow } from './contracts.js';
import { executeContractCall } from './txs.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';

// KarwanReputation.Outcome enum: None=0, Success=1, DisputeResolved=2, Failed=3.
export const OUTCOME_SUCCESS = 1;
export const OUTCOME_DISPUTE_RESOLVED = 2;
export const OUTCOME_FAILED = 3;
export type ReputationOutcome =
  | typeof OUTCOME_SUCCESS
  | typeof OUTCOME_DISPUTE_RESOLVED
  | typeof OUTCOME_FAILED;
const OUTCOME_LABEL: Record<ReputationOutcome, string> = {
  [OUTCOME_SUCCESS]: 'success',
  [OUTCOME_DISPUTE_RESOLVED]: 'dispute',
  [OUTCOME_FAILED]: 'failed',
};
// KarwanEscrow.EscrowState enum: None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
export const ESCROW_FUNDED = 1;
export const ESCROW_SETTLED = 2;
export const ESCROW_DISPUTED = 3;

/// Releases a single milestone via the given buyer agent wallet and emits the
/// event. The wallet must be the escrow's on-chain buyer. Returns the tx hash.
export async function releaseMilestone(
  jobId: string,
  index: number,
  walletId: string,
): Promise<string> {
  if (!walletId) throw new Error('release requires a buyer agent wallet id');
  const result = await executeContractCall(
    {
      walletId,
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
/// settled event and records reputation via the buyer agent wallet. Safe to
/// call after any release.
export async function finalizeIfSettled(
  jobId: string,
  walletId: string,
): Promise<boolean> {
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
  await recordReputation(jobId, walletId);
  return true;
}

/// Records a deal outcome on the reputation registry, rated by the buyer agent
/// wallet. Outcome defaults to success; pass Failed for a buyer cancel (the
/// seller never delivered) or DisputeResolved for an appeal. Idempotent: the
/// contract locks one record per jobId, and we skip if already recorded.
///
/// ERC-4337 inner-revert verification: Circle reporting COMPLETE on the
/// userOp wrapper (handleOps) does NOT guarantee the inner recordCompletion
/// call landed. The wrapper can succeed while the inner call reverts — the
/// "escrow got 0" bug (see karwan_erc4337_innerrevert.md) was the same
/// shape on fundEscrow. Without a re-read, we'd emit reputation.recorded +
/// surface a "Reputation recorded on chain" notification to the user, while
/// the contract's `scores[subject]` mapping stays at zero. The credit
/// passport then shows 0 settled deals despite the success notification.
/// Fix: after executeContractCall returns, re-read `recorded[jobId]`. If
/// it's still false, the inner call reverted; emit an agent.error instead
/// of reputation.recorded so the reconciler picks it up on the next pass.
export async function recordReputation(
  jobId: string,
  walletId: string,
  outcome: ReputationOutcome = OUTCOME_SUCCESS,
): Promise<void> {
  if (!walletId) return;
  const label = OUTCOME_LABEL[outcome];
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
        walletId,
        contractAddress: reputation.address,
        abiFunctionSignature: 'recordCompletion(bytes32,address,address,uint8)',
        abiParameters: [jobId, buyer, seller, outcome.toString()],
      },
      `recordCompletion(${jobId}, ${label})`,
    );

    // Verify on-chain state landed. Circle's COMPLETE state means the
    // handleOps wrapper succeeded, but the inner recordCompletion may have
    // reverted (NotParty if msg.sender != buyer/seller on chain, or a
    // contract-redeploy mismatch). Without this re-read we'd emit
    // reputation.recorded for a call that never actually wrote.
    let verified = false;
    try {
      verified = (await reputation.read.recorded([
        jobId as `0x${string}`,
      ])) as boolean;
    } catch (err) {
      logger.warn(
        { jobId, err: (err as Error).message },
        'reputation post-write verify read failed',
      );
    }

    if (!verified) {
      const message = `Circle reported COMPLETE on tx ${result.txHash} but recorded[${jobId}] is still false; inner recordCompletion likely reverted (ERC-4337 wrapper masked it).`;
      logger.error(
        { jobId, seller, outcome: label, txHash: result.txHash },
        'reputation inner-revert detected; chain state unchanged',
      );
      // Route through the process-wide error tracker so the failure shows in
      // /api/admin/errors. Without this it stays only in pino at error level
      // and operators can't see it via the live admin endpoint.
      reportError(
        'recordReputation.innerRevert',
        new Error(message),
        { jobId, seller, outcome: label, txHash: result.txHash },
      );
      bus.emitEvent({
        type: 'agent.error',
        jobId,
        actor: 'buyer',
        payload: { scope: 'recordCompletion', message },
      });
      return;
    }

    bus.emitEvent({
      type: 'reputation.recorded',
      jobId,
      actor: 'buyer',
      payload: { subject: seller, rater: buyer, outcome: label, txHash: result.txHash },
    });
    logger.info({ jobId, seller, outcome: label, txHash: result.txHash }, 'reputation recorded');
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
