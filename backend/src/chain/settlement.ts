import {
  escrow,
  reputation,
  readEscrow,
  invalidateEscrowCache,
  ESCROW_STATE,
} from './contracts.js';
import { executeContractCall, type ContractCallInput } from './txs.js';
import { config } from '../config.js';
import { bus } from '../events.js';
import { logger } from '../logger.js';
import { reportError } from '../errorTracker.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
/// userOp reverted. See karwan_erc4337_innerrevert.md for the original
/// "escrow got 0" repro. Without an on-chain state read after every COMPLETE,
/// the wrappers would emit `escrow.accepted` / `escrow.milestone.released` /
/// `escrow.released_from_dispute` (and the dispute/refund equivalents) on a
/// userOp that never touched escrow state, falsely advancing off-chain
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
  /// Releases don't end in a single target state. A non-final milestone
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

/// Build the fundEscrow contract call, threading the per-deal clock on v2b.
///
/// v2.E (flag off): the 5-arg fundEscrow, no on-chain timing.
/// v2b (flag on): the 6-arg overload carrying Timing{deliveryDeadline,
///   reviewWindow, reclaimGrace}. deliveryDeadline is the deal's delivery
///   deadline (absolute unix seconds; 0 = open-ended, no timeout reclaim).
///   reviewWindow and reclaimGrace come from the same config the off-chain
///   watcher uses, so the on-chain reclaim clock matches the off-chain one.
///   Circle encodes the struct param as a nested array [deadline, window, grace].
export function buildFundEscrowCall(
  walletId: string,
  escrowAddress: string,
  jobId: string,
  sellerAddress: string,
  dealAmountWei: bigint,
  milestonePcts: number[],
  reservationBps: number,
  deadlineUnix: number | null | undefined,
): ContractCallInput {
  const base = {
    walletId,
    contractAddress: escrowAddress,
    abiParameters: [
      jobId,
      sellerAddress,
      dealAmountWei.toString(),
      milestonePcts,
      reservationBps,
    ] as unknown[],
  };
  if (!config.ESCROW_V2B_ENABLED) {
    return { ...base, abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[],uint16)' };
  }
  const reviewWindowSecs = Math.floor(config.DEAL_REVIEW_WINDOW_MS / 1000);
  const reclaimGraceSecs = Math.floor(config.DEAL_DEADLINE_RECLAIM_GRACE_MS / 1000);
  const deadline = deadlineUnix && deadlineUnix > 0 ? Math.floor(deadlineUnix) : 0;
  return {
    ...base,
    abiFunctionSignature: 'fundEscrow(bytes32,address,uint256,uint8[],uint16,(uint64,uint64,uint64))',
    abiParameters: [
      ...base.abiParameters,
      [deadline.toString(), reviewWindowSecs.toString(), reclaimGraceSecs.toString()],
    ],
  };
}

// ============================ v2b lifecycle ============================
// These wrappers call KarwanEscrow v2b functions that don't exist on the
// v2.E contract. They are inert until config.ESCROW_V2B_ENABLED is on and
// KARWAN_ESCROW_ADDR points at a v2b deploy; every caller gates on that flag.
// Like the v2.E wrappers they pass a Circle SCA (DCW) agent wallet and verify
// the post-state after the COMPLETE to defend against the ERC-4337
// inner-revert (see the assertEscrowState comment above).

/// The buyer's trustless timeout exit (v2b). Callable from Accepted when the
/// consented delivery deadline + grace has passed with nothing pending review.
/// Refunds the buyer and slashes the reservation proportionally to the
/// undelivered fraction, recording Failed on chain. Replaces the v2.E
/// dispute+refund auto-reclaim, which reverts post-accept on v2b.
/// payee address(0) pays the stored buyer wallet (the signing agent).
export async function reclaimAfterDeadline(
  jobId: string,
  buyerAgentWalletId: string,
): Promise<string> {
  if (!buyerAgentWalletId) throw new Error('reclaimAfterDeadline requires a buyer agent wallet id');
  const result = await executeContractCall(
    {
      walletId: buyerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'reclaimAfterDeadline(bytes32,address)',
      abiParameters: [jobId, ZERO_ADDRESS],
    },
    `reclaimAfterDeadline(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Refunded, 'reclaimAfterDeadline', result.txHash);
  return result.txHash;
}

/// Seller claims a milestone after the buyer's review window elapses (v2b).
/// The buyer-vanished safety net: once the seller marked delivery and the window
/// passed with no buyer release/dispute, the seller forces the payout. Signed by
/// the seller agent. Same milestone-counter guard as releaseMilestone.
export async function claimMilestone(
  jobId: string,
  index: number,
  sellerAgentWalletId: string,
): Promise<string> {
  if (!sellerAgentWalletId) throw new Error('claimMilestone requires a seller agent wallet id');
  const result = await executeContractCall(
    {
      walletId: sellerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'claimMilestone(bytes32,uint8)',
      abiParameters: [jobId, index.toString()],
    },
    `claimMilestone(${jobId}, ${index})`,
  );
  invalidateEscrowCache(jobId);
  const account = await readEscrow(jobId);
  if (account.milestonesReleased <= index) {
    throw new Error(
      `claimMilestone inner-reverted: tx ${result.txHash} COMPLETE but milestonesReleased=${account.milestonesReleased}, expected >${index}.`,
    );
  }
  bus.emitEvent({
    type: 'escrow.milestone.released',
    jobId,
    actor: 'seller',
    payload: { milestoneIndex: index, txHash: result.txHash, byClaim: true },
  });
  return result.txHash;
}

/// Buyer-only deadline extension (v2b). Mirrors the off-chain extension-approve
/// flow so the on-chain clock tracks the agreed new deadline. newDeadline is
/// absolute unix seconds.
export async function extendDeadlineOnChain(
  jobId: string,
  buyerAgentWalletId: string,
  newDeadlineUnix: number,
): Promise<string> {
  if (!buyerAgentWalletId) throw new Error('extendDeadline requires a buyer agent wallet id');
  const result = await executeContractCall(
    {
      walletId: buyerAgentWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'extendDeadline(bytes32,uint64)',
      abiParameters: [jobId, Math.floor(newDeadlineUnix).toString()],
    },
    `extendDeadline(${jobId})`,
  );
  return result.txHash;
}

/// Either party lapses a stale dispute back to Accepted after the dispute
/// timeout (v2b), so a dead arbiter can't trap funds. The frozen time extends
/// the delivery deadline on chain. Verifies the return to Accepted.
export async function lapseDispute(jobId: string, walletId: string): Promise<string> {
  if (!walletId) throw new Error('lapseDispute requires a signer wallet id');
  const result = await executeContractCall(
    {
      walletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'lapseDispute(bytes32)',
      abiParameters: [jobId],
    },
    `lapseDispute(${jobId})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Accepted, 'lapseDispute', result.txHash);
  return result.txHash;
}

/// Drive the two-tx mutual-cancel handshake (v2b) to settle a post-accept deal
/// by consent, replacing the v2.E post-accept refund. The backend controls
/// both agent wallets, so it proposes with one side and accepts with the other
/// in a single operation. sellerBps splits the unreleased funds (0 = full
/// buyer refund). Works from Accepted or Disputed. Payees default to the stored
/// wallets. Verifies the escrow reached Settled.
export async function mutualCancelOnChain(
  jobId: string,
  proposerWalletId: string,
  acceptorWalletId: string,
  sellerBps: number,
): Promise<string> {
  if (!proposerWalletId || !acceptorWalletId) {
    throw new Error('mutualCancel requires both agent wallet ids');
  }
  const bps = Math.round(sellerBps).toString();
  await executeContractCall(
    {
      walletId: proposerWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'proposeCancel(bytes32,uint16,address)',
      abiParameters: [jobId, bps, ZERO_ADDRESS],
    },
    `proposeCancel(${jobId}, ${bps})`,
  );
  const result = await executeContractCall(
    {
      walletId: acceptorWalletId,
      contractAddress: escrow.address,
      abiFunctionSignature: 'acceptCancel(bytes32,uint16,address)',
      abiParameters: [jobId, bps, ZERO_ADDRESS],
    },
    `acceptCancel(${jobId}, ${bps})`,
  );
  await assertEscrowState(jobId, ESCROW_STATE.Settled, 'acceptCancel', result.txHash);
  return result.txHash;
}

// ============================ Guardian (v2b) ===========================
// The security agent's on-chain hand. Signs from the guardian wallet
// (config.GUARDIAN_WALLET_ID). All are best-effort: a guardian action must
// never block the delivery/settlement flow, so callers fire-and-forget and log.
// Inert until the v2 escrow is live and the guardian wallet is set + wired as
// the escrow's guardian.

/// Freeze the seller-paying paths for a jobId while the off-chain pipeline
/// runs (flagged delivery link, fraud review). Auto-expires on chain.
export async function guardianHold(jobId: string, reasonHash: string): Promise<string | null> {
  if (!config.ESCROW_V2B_ENABLED || !config.GUARDIAN_WALLET_ID) return null;
  try {
    const result = await executeContractCall(
      {
        walletId: config.GUARDIAN_WALLET_ID,
        contractAddress: escrow.address,
        abiFunctionSignature: 'hold(bytes32,bytes32)',
        abiParameters: [jobId, reasonHash],
      },
      `guardian.hold(${jobId})`,
    );
    bus.emitEvent({ type: 'security.hold', jobId, actor: 'platform', payload: { txHash: result.txHash } });
    return result.txHash;
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'guardian.hold failed (non-blocking)');
    return null;
  }
}

/// Lift a hold once the flagged proof clears.
export async function guardianReleaseHold(jobId: string): Promise<string | null> {
  if (!config.ESCROW_V2B_ENABLED || !config.GUARDIAN_WALLET_ID) return null;
  try {
    const result = await executeContractCall(
      {
        walletId: config.GUARDIAN_WALLET_ID,
        contractAddress: escrow.address,
        abiFunctionSignature: 'releaseHold(bytes32)',
        abiParameters: [jobId],
      },
      `guardian.releaseHold(${jobId})`,
    );
    bus.emitEvent({ type: 'security.hold.cleared', jobId, actor: 'platform', payload: { txHash: result.txHash } });
    return result.txHash;
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'guardian.releaseHold failed (non-blocking)');
    return null;
  }
}

/// Attest a marked delivery. pass=true collapses the review window so an
/// agent-verified good delivery settles sooner; pass=false places a hold.
export async function guardianAttestDelivery(
  jobId: string,
  milestoneIndex: number,
  pass: boolean,
  evidenceHash: string,
): Promise<string | null> {
  if (!config.ESCROW_V2B_ENABLED || !config.GUARDIAN_WALLET_ID) return null;
  try {
    const result = await executeContractCall(
      {
        walletId: config.GUARDIAN_WALLET_ID,
        contractAddress: escrow.address,
        abiFunctionSignature: 'attestDelivery(bytes32,uint8,bool,bytes32)',
        abiParameters: [jobId, milestoneIndex.toString(), pass, evidenceHash],
      },
      `guardian.attestDelivery(${jobId}, ${pass})`,
    );
    bus.emitEvent({
      type: 'security.attested',
      jobId,
      actor: 'platform',
      payload: { pass, txHash: result.txHash },
    });
    return result.txHash;
  } catch (err) {
    logger.warn({ jobId, err: (err as Error).message }, 'guardian.attestDelivery failed (non-blocking)');
    return null;
  }
}

/// Reads the escrow on chain; if it has reached the Settled state, emits
/// the settled event. The on-chain reputation write now happens atomically
/// inside KarwanEscrow.releaseProgress / releaseFinal / releaseFromDispute /
/// refund (v2.D moves recordCompletion onto the escrow contract, gated to
/// onlyEscrow on the reputation side). So we no longer call
/// recordReputation from here. The chain handles it.
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
    const { buyer, seller, state } = await readEscrow(jobId);
    // No escrow on the current contract = an orphaned or pre-redeploy deal
    // (its DB row outlived the contract it settled on). recordCompletion can
    // never reference it, so skip quietly instead of firing a doomed tx and an
    // agent.error on every reconciler tick. This is what made deal 0x45a953...
    // loop. Real candidates (settled on the live contract) still pass through.
    if (state === ESCROW_STATE.None) {
      logger.info({ jobId }, 'reputation skip: deal has no escrow on the current contract');
      return;
    }
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
