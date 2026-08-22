import type { ContractCallLifecycle } from '../chain/txs.js';
import {
  acceptMutualCancelOnChain,
  proposeMutualCancelOnChain,
} from '../chain/settlement.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { parseUsdcMicros, type MoneyMovement } from './model.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  prepareMoneyMovementContractLeg,
  verifyConfirmedMoneyMovementLegByKey,
  verifyMoneyMovementLeg,
} from './service.js';

export interface EscrowMutualCancelInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  buyerAddress: string;
  sellerAddress: string;
  buyerAgentAddress: string;
  sellerAgentAddress: string;
  buyerAgentWalletId: string;
  sellerAgentWalletId: string;
  sellerBps: number;
  jobId: string;
  summary: string;
  escrowAddress: string;
}

export interface EscrowMutualCancelExecution {
  movement: MoneyMovement;
  proposeTxHash?: string;
  acceptTxHash?: string;
  alreadyRecorded: boolean;
}

export async function ensureEscrowMutualCancelMovement(
  input: EscrowMutualCancelInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'escrow_refund',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.buyerAddress, role: 'buyer' },
      { address: input.sellerAddress, role: 'seller' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
    jobId: input.jobId,
  });
}

export async function executeEscrowMutualCancelMovement(
  input: EscrowMutualCancelInput,
): Promise<EscrowMutualCancelExecution> {
  const ensured = await ensureEscrowMutualCancelMovement(input);
  if (ensured.movement.state === 'completed') {
    const proofs = proofHashes(ensured.movement);
    return {
      movement: ensured.movement,
      proposeTxHash: proofs.propose,
      acceptTxHash: proofs.accept,
      alreadyRecorded: true,
    };
  }

  const amountMicros = parseUsdcMicros(input.amountUsdc);
  const proposeTxHash = await runLeg(
    ensured.movement.reference,
    {
      key: 'propose_cancel',
      label: 'Mutual cancellation proposal',
      rail: 'arc_contract',
      walletId: input.buyerAgentWalletId,
      signerAddress: input.buyerAgentAddress,
      sourceAddress: input.buyerAgentAddress,
      destinationAddress: input.sellerAgentAddress,
      contractAddress: input.escrowAddress,
      amountMicros,
    },
    (options) =>
      proposeMutualCancelOnChain(
        input.jobId,
        input.buyerAgentWalletId,
        input.sellerBps,
        options,
      ),
  );

  const acceptTxHash = await runLeg(
    ensured.movement.reference,
    {
      key: 'accept_cancel',
      label: 'Mutual cancellation acceptance',
      rail: 'arc_contract',
      walletId: input.sellerAgentWalletId,
      signerAddress: input.sellerAgentAddress,
      sourceAddress: input.sellerAgentAddress,
      destinationAddress: input.buyerAgentAddress,
      contractAddress: input.escrowAddress,
      amountMicros,
    },
    (options) =>
      acceptMutualCancelOnChain(
        input.jobId,
        input.sellerAgentWalletId,
        input.sellerBps,
        options,
      ),
  );

  const movement = await completeMoneyMovement(ensured.movement.reference, {
    amountMicros,
  });
  return { movement, proposeTxHash, acceptTxHash, alreadyRecorded: false };
}

async function runLeg(
  reference: string,
  input: {
    key: string;
    label: string;
    rail: 'arc_contract';
    walletId: string;
    signerAddress: string;
    sourceAddress: string;
    destinationAddress: string;
    contractAddress: string;
    amountMicros: bigint;
  },
  execute: (options: {
    idempotencyKey: string;
    lifecycle: ContractCallLifecycle;
  }) => Promise<string>,
): Promise<string | undefined> {
  const prepared = await prepareMoneyMovementContractLeg(reference, input);
  let leg = prepared.leg;
  if (leg.state === 'confirmed') {
    await verifyConfirmedMoneyMovementLegByKey(reference, input.key, {
      amountMicros: input.amountMicros,
    });
    leg = (await currentMoneyMovement(reference)).legs.find((candidate) => candidate.id === leg.id) ?? leg;
  }
  if (leg.state === 'verified') return leg.txHash;

  const txHash = await execute({
    idempotencyKey: prepared.idempotencyKey,
    lifecycle: prepared.lifecycle,
  });
  await verifyMoneyMovementLeg(reference, leg.id, { amountMicros: input.amountMicros });
  return txHash;
}

function proofHashes(movement: MoneyMovement): { propose?: string; accept?: string } {
  const current = movement.legs.filter((leg) => leg.attempt === movement.attempt);
  return {
    propose: current.find((leg) => leg.key === 'propose_cancel')?.txHash,
    accept: current.find((leg) => leg.key === 'accept_cancel')?.txHash,
  };
}
