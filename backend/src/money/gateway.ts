import {
  beginOrResumeMoneyMovement,
  currentMoneyMovement,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { ensureMoneyMovement, updateMoneyMovement } from '../db/moneyMovements.js';
import {
  parseUsdcMicros,
  planMoneyMovementLeg,
  type MoneyMovement,
  type MoneyMovementLeg,
} from './model.js';
import type { ContractCallLifecycle } from '../chain/txs.js';

export interface GatewayDepositMovementInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  sourceAddress: string;
  summary: string;
}

/** Allocate the receipt before any Gateway contract write. */
export async function ensureGatewayDepositMovement(
  input: GatewayDepositMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'deposit',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.sourceAddress, role: 'source' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
  });
}

/**
 * Gateway's source-chain transactions are durable contract legs. The third
 * leg is deliberately planned but not verified here: only a Gateway finality
 * webhook/reconciler may advance it and complete the movement.
 */
export async function prepareGatewayDepositMovement(
  reference: string,
  input: {
    sourceAddress: string;
    gatewayContractAddress: string;
    sourceWalletId: string;
    amountMicros: bigint | string;
    usdcAddress: string;
    gatewayWalletAddress: string;
  },
): Promise<MoneyMovement> {
  await beginOrResumeMoneyMovement(reference);
  await updateMoneyMovement(reference, (current) =>
    planMoneyMovementLeg(current, {
      key: 'gateway_finality',
      label: 'Gateway deposit finality',
      rail: 'gateway',
      sourceAddress: input.sourceAddress,
      destinationAddress: input.gatewayWalletAddress,
      amountMicros: input.amountMicros,
    }),
  );

  const approve = await prepareMoneyMovementContractLeg(reference, {
    key: 'gateway_approve',
    label: 'Gateway deposit approval',
    rail: 'circle_wallets',
    walletId: input.sourceWalletId,
    signerAddress: input.sourceAddress,
    sourceAddress: input.sourceAddress,
    destinationAddress: input.gatewayContractAddress,
    contractAddress: input.usdcAddress,
    amountMicros: input.amountMicros,
  });
  if (approve.leg.state === 'confirmed') {
    await verifyMoneyMovementLeg(reference, approve.leg.id);
  }

  return currentMoneyMovement(reference);
}

export async function gatewayDepositLeg(
  reference: string,
  key: 'gateway_approve' | 'gateway_deposit',
  input: {
    sourceAddress: string;
    gatewayContractAddress: string;
    sourceWalletId: string;
    amountMicros: bigint | string;
    usdcAddress: string;
    gatewayWalletAddress: string;
  },
): Promise<{
  movement: MoneyMovement;
  leg: MoneyMovementLeg;
  idempotencyKey: string;
  lifecycle: ContractCallLifecycle;
}> {
  const prepared = await prepareMoneyMovementContractLeg(reference, {
    key,
    label: key === 'gateway_approve' ? 'Gateway deposit approval' : 'Gateway deposit',
    rail: 'circle_wallets',
    walletId: input.sourceWalletId,
    signerAddress: input.sourceAddress,
    sourceAddress: input.sourceAddress,
    destinationAddress: key === 'gateway_approve' ? input.gatewayContractAddress : input.gatewayWalletAddress,
    contractAddress: key === 'gateway_approve' ? input.usdcAddress : input.gatewayContractAddress,
    amountMicros: input.amountMicros,
  });
  return prepared;
}

export function gatewayLegTx(movement: MoneyMovement, key: string): string | undefined {
  return movement.legs.find(
    (leg) => leg.attempt === movement.attempt && leg.key === key,
  )?.txHash;
}
