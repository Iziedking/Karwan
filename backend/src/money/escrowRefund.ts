import type { ContractCallLifecycle } from '../chain/txs.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { parseUsdcMicros, type MoneyMovement } from './model.js';

export interface EscrowRefundMovementInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  buyerAgentAddress: string;
  sellerAddress: string;
  jobId: string;
  summary: string;
  escrowAddress: string;
  buyerAgentWalletId: string;
}

export interface EscrowRefundExecution {
  movement: MoneyMovement;
  txHash?: string;
  alreadyRecorded: boolean;
}

/**
 * Return the amount still locked in escrow. This intentionally uses the
 * contract's current deal/released values instead of the original deal total
 * so a partial milestone release can never be refunded twice.
 */
export function remainingEscrowMicros(dealAmount: bigint | string, released: bigint | string): bigint {
  const remaining = BigInt(dealAmount) - BigInt(released);
  if (remaining < 0n) throw new Error('ESCROW_RELEASED_EXCEEDS_DEAL_AMOUNT');
  return remaining;
}

/** Allocate the buyer's refund receipt before any dispute/reclaim write. */
export async function ensureEscrowRefundMovement(
  input: EscrowRefundMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'escrow_refund',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.buyerAgentAddress, role: 'recipient' },
      { address: input.sellerAddress, role: 'counterparty' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
    jobId: input.jobId,
  });
}

/**
 * Execute a one-call escrow refund/reclaim through the existing settlement
 * wrapper. Circle receives the movement idempotency key and lifecycle sink;
 * completion is impossible until the returned Arc transaction is verified.
 */
export async function executeEscrowRefundMovement(
  input: EscrowRefundMovementInput,
  execute: (options: {
    idempotencyKey: string;
    lifecycle: ContractCallLifecycle;
  }) => Promise<string>,
): Promise<EscrowRefundExecution> {
  const ensured = await ensureEscrowRefundMovement(input);
  if (ensured.movement.state === 'completed') {
    return {
      movement: ensured.movement,
      txHash: latestProof(ensured.movement),
      alreadyRecorded: true,
    };
  }
  if (ensured.movement.state === 'needs_attention') {
    throw new Error(`ESCROW_REFUND_NEEDS_ATTENTION:${ensured.movement.reference}`);
  }

  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, {
    key: 'refund',
    label: 'Escrow refund to buyer agent',
    rail: 'arc_contract',
    walletId: input.buyerAgentWalletId,
    signerAddress: input.buyerAgentAddress,
    sourceAddress: input.escrowAddress,
    destinationAddress: input.buyerAgentAddress,
    contractAddress: input.escrowAddress,
    amountMicros: parseUsdcMicros(input.amountUsdc),
  });

  const txHash = await execute({
    idempotencyKey: prepared.idempotencyKey,
    lifecycle: prepared.lifecycle,
  });
  await verifyMoneyMovementLeg(ensured.movement.reference, prepared.leg.id, {
    amountMicros: parseUsdcMicros(input.amountUsdc),
  });
  const movement = await completeMoneyMovement(ensured.movement.reference, {
    amountMicros: parseUsdcMicros(input.amountUsdc),
  });
  return { movement, txHash, alreadyRecorded: false };
}

function latestProof(movement: MoneyMovement): string | undefined {
  return [...movement.legs]
    .filter((leg) => leg.attempt === movement.attempt && leg.txHash)
    .sort((a, b) => (b.verifiedAt ?? b.confirmedAt ?? 0) - (a.verifiedAt ?? a.confirmedAt ?? 0))[0]
    ?.txHash;
}

export async function escrowRefundMovement(reference: string): Promise<MoneyMovement> {
  return currentMoneyMovement(reference);
}
