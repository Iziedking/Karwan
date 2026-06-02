import {
  escrow,
  reputation,
  readEscrow,
  invalidateEscrowCache,
  ESCROW_STATE,
} from './contracts.js';
import { executeContractCall } from './txs.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';

/// KarwanReputation.Outcome enum: None=0, Success=1, DisputeResolved=2, Failed=3.
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

/// KarwanEscrow v2.D state enum. Re-exported from contracts.ts for callers
/// that previously imported the legacy ESCROW_FUNDED / ESCROW_SETTLED /
/// ESCROW_DISPUTED constants directly.
export const ESCROW_FUNDED = ESCROW_STATE.Funded;
export const ESCROW_ACCEPTED = ESCROW_STATE.Accepted;
export const ESCROW_SETTLED = ESCROW_STATE.Settled;
export const ESCROW_DISPUTED = ESCROW_STATE.Disputed;
export const ESCROW_REFUNDED = ESCROW_STATE.Refunded;

/// Every wrapper in this file talks to KarwanEscrow through a Circle SCA
/// (DCW) wallet, which routes the call through ERC-4337 handleOps. Circle
/// reports COMPLETE the moment handleOps lands on chain, even when the inner
/// userOp reverted — see karwan_erc4337_innerrevert.md for the original
/// "escrow got 0" repro. Without an on-chain state read after every COMPLETE,
/// the wrappers would emit `escrow.accepted` / `escrow.milestone.released` /
/// `escrow.released_from_dispute` (and the dispute/refund equivalents) on a
/// userOp that never touched escrow state — falsely advancing off-chain
/// `deal.disputed` / `cancelledAt` / `settledAt` while funds stay locked.
/// Each wrapper now re-reads the escrow after the COMPLETE, asserts the
/// expected post-state, and only THEN emits the bus event. A mismatch throws
/// so the caller's catch surfaces the inner-revert to the user.
async function assertEscrowState(
  jobId: string,
  expected: number,
  label: string,
  txHash: string,
): Promise<void> {
  invalidateEscrowCache(jobId);
  const account = await readEscrow(jobId);
  if (account.state !== expected) {
    const message = `${label} inner-reverted: tx ${txHash} returned COMPLETE but escrow state is ${account.state}, expected ${expected}.`;
    logger.error({ jobId, txHash, expected, actual: account.state }, message);
    throw new Error(message);
  }
}

/// Seller acceptance is a new on-chain step in v2.D. The seller agent
/// signs acceptEscrow(jobId), which transitions the escrow to Accepted and
/// locks the insurance reservation on the vault. Without this, releases
/// are blocked. Called by the deal accept route.
export async function acceptEscrow(jobId: string, sellerAgentWalletId: string): Promise<string> {
  if (!sellerAgentWalletId) throw new Error('acceptEscrow requires a seller agent wallet id');
  const result = await executeContractCall(
    {
      walletId: sellerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'acceptEscrow(bytes32)',
      abiParameters: [jobId],
    },
    `acceptEscrow(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Accepted, 'acceptEscrow', result.txHash);
  bus.emitEvent({
    type: 'escrow.accepted',
    jobId,
    actor: 'seller',
    payload: { txHash: result.txHash },
  });
  return result.txHash;
}

/// Releases a single milestone via the given buyer agent wallet and emits
/// the event. The wallet must be the escrow's on-chain buyer. Returns the
/// tx hash.
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
  /// Releases don't end in a single target state — a non-final milestone
  /// leaves the escrow in Accepted (with the counter advanced), and the
  /// final milestone lands in Settled. So instead of asserting state, read
  /// milestonesReleased and ensure it moved past `index`. A stuck counter
  /// is the inner-revert tell.
  invalidateEscrowCache(jobId);
  const account = await readEscrow(jobId);
  if (account.milestonesReleased <= index) {
    const message = `releaseProgress inner-reverted: tx ${result.txHash} returned COMPLETE but milestonesReleased=${account.milestonesReleased}, expected >${index}.`;
    logger.error(
      { jobId, txHash: result.txHash, expectedGt: index, actual: account.milestonesReleased },
      message,
    );
    throw new Error(message);
  }
  bus.emitEvent({
    type: 'escrow.milestone.released',
    jobId,
    actor: 'buyer',
    payload: { milestoneIndex: index, txHash: result.txHash },
  });
  return result.txHash;
}

/// Buyer-only path from Disputed to Settled. Pays the seller the remaining
/// funds, releases the vault reservation, and records reputation as
/// DisputeResolved on both sides. Used when the buyer accepts late delivery
/// despite the dispute (the existing /jobs/[id] "Accept & release" UI).
export async function releaseFromDispute(
  jobId: string,
  buyerAgentWalletId: string,
): Promise<string> {
  if (!buyerAgentWalletId) throw new Error('releaseFromDispute requires a buyer agent wallet id');
  const result = await executeContractCall(
    {
      walletId: buyerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'releaseFromDispute(bytes32)',
      abiParameters: [jobId],
    },
    `releaseFromDispute(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Settled, 'releaseFromDispute', result.txHash);
  bus.emitEvent({
    type: 'escrow.released_from_dispute',
    jobId,
    actor: 'buyer',
    payload: { txHash: result.txHash },
  });
  return result.txHash;
}

/// Buyer or seller raises a dispute, freezing the escrow until resolved.
/// Transitions Accepted -> Disputed. Either party's agent wallet can sign;
/// the contract gates msg.sender to the escrow's buyer or seller.
export async function disputeEscrow(
  jobId: string,
  walletId: string,
  reason: string,
): Promise<string> {
  if (!walletId) throw new Error('disputeEscrow requires a signer wallet id');
  const result = await executeContractCall(
    {
      walletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'dispute(bytes32,string)',
      abiParameters: [jobId, reason],
    },
    `dispute(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Disputed, 'dispute', result.txHash);
  return result.txHash;
}

/// Refund the buyer from a Disputed escrow. Buyer-only on chain. Transitions
/// Disputed -> Refunded, releases the reservation on the vault (slashing it
/// when the seller breached, or returning it to free stake when not), and
/// records the on-chain reputation outcome.
export async function refundEscrow(jobId: string, buyerAgentWalletId: string): Promise<string> {
  if (!buyerAgentWalletId) throw new Error('refundEscrow requires a buyer agent wallet id');
  const result = await executeContractCall(
    {
      walletId: buyerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'refund(bytes32)',
      abiParameters: [jobId],
    },
    `refund(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Refunded, 'refund', result.txHash);
  return result.txHash;
}

/// Reads the escrow on chain; if it has reached the Settled state, emits
/// the settled event. The on-chain reputation write now happens atomically
/// inside KarwanEscrow.releaseProgress / releaseFinal / releaseFromDispute /
/// refund (v2.D moves recordCompletion onto the escrow contract, gated to
/// onlyEscrow on the reputation side). So we no longer call
/// recordReputation from here — the chain handles it.
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
  return true;
}

/// LEGACY: records a deal outcome by calling KarwanReputation.recordCompletion
/// directly from the buyer agent wallet. Pre-v2.D path. Kept around for the
/// admin backfill endpoint when working against a legacy reputation contract
/// (i.e. KARWAN_REPUTATION_ADDR points at a pre-v2.D deploy that doesn't
/// have the onlyEscrow gate).
///
/// On v2.D, this function will fail because the new reputation contract
/// rejects every caller except KarwanEscrow. That's the intended behavior:
/// v2.D escrow records on chain automatically, so there's no drift to
/// reconcile and this function should never be invoked. The admin
/// /reputation/backfill endpoint that wraps it will report `failed: true`
/// against v2.D contracts, signalling the operator to disable the legacy
/// reconciler in env.
///
/// ERC-4337 inner-revert verification: Circle reporting COMPLETE on the
/// userOp wrapper (handleOps) does NOT guarantee the inner call landed.
/// See karwan_erc4337_innerrevert.md. After executeContractCall returns we
/// re-read `recorded[jobId]`; if still false the inner call reverted and
/// we emit agent.error instead of reputation.recorded.
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
      const message = `Circle reported COMPLETE on tx ${result.txHash} but recorded[${jobId}] is still false; inner recordCompletion likely reverted (probable cause on v2.D: reputation contract is gated onlyEscrow and refuses backend agent writes).`;
      logger.error(
        { jobId, seller, outcome: label, txHash: result.txHash },
        'reputation inner-revert detected; chain state unchanged',
      );
      reportError('recordReputation.innerRevert', new Error(message), {
        jobId,
        seller,
        outcome: label,
        txHash: result.txHash,
      });
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
    logger.info(
      { jobId, seller, outcome: label, txHash: result.txHash },
      'reputation recorded',
    );
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
