import {
  completeMoneyMovement,
  currentMoneyMovement,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros } from './model.js';
import { config } from '../config.js';

export type ObservedWalletRole = 'identity' | 'buyerAgent' | 'sellerAgent';

export interface ObservedArcDepositInput {
  txHash: string;
  logIndex: number;
  amountMicros: bigint | string;
  owner: string;
  sourceAddress: string;
  destinationAddress: string;
  walletRole: ObservedWalletRole;
  /** Optional wording for platform-originated seed transfers. */
  summary?: string;
}

/**
 * A chain log is the durable idempotency boundary for an inbound Arc credit.
 * The same transfer can be seen by the watcher after a restart, so this key
 * must never contain a random value or a polling timestamp.
 */
export function observedArcDepositOperationKey(txHash: string, logIndex: number): string {
  return `arc:observed-deposit:${txHash.toLowerCase()}:${Math.max(0, Math.trunc(logIndex))}`;
}

export function observedArcDepositSummary(input: Pick<ObservedArcDepositInput, 'amountMicros' | 'walletRole'>): string {
  const amount = formatUsdcMicros(input.amountMicros);
  if (input.walletRole === 'identity') return `Deposited ${amount} USDC into your identity wallet`;
  const agent = input.walletRole === 'buyerAgent' ? 'buyer' : 'seller';
  return `Deposited ${amount} USDC into your ${agent} agent wallet`;
}

/**
 * Turn an already-mined ERC-20 Transfer log into a completed MoneyMovement.
 * The transfer is not submitted by this function; the watcher has observed a
 * successful chain log already. We still advance the normal movement/leg
 * lifecycle so receipts, retries, and the personal ledger share one model.
 */
export async function recordObservedArcDeposit(
  input: ObservedArcDepositInput,
) {
  const operationKey = observedArcDepositOperationKey(input.txHash, input.logIndex);
  const amountMicros = BigInt(input.amountMicros);
  const ensured = await ensureMoneyMovement({
    operationKey,
    kind: 'deposit',
    amountMicros,
    initiatedBy: input.owner,
    participants: [
      { address: input.owner, role: 'owner' },
      { address: input.sourceAddress, role: 'source' },
      { address: input.destinationAddress, role: 'recipient' },
    ],
    summary: input.summary ?? observedArcDepositSummary(input),
    nextActor: 'karwan',
  });

  if (ensured.movement.state === 'completed') return ensured.movement;

  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, {
    key: 'arc_transfer_observed',
    label: 'Arc USDC transfer observed',
    rail: 'circle_wallets',
    signerAddress: input.sourceAddress,
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    amountMicros,
  });

  await prepared.lifecycle.onSubmitted?.({ txId: input.txHash, estimatedFee: null });
  await prepared.lifecycle.onConfirmed?.({
    txId: input.txHash,
    txHash: input.txHash,
    explorerUrl: `${config.ARC_TESTNET_EXPLORER_URL}/tx/${input.txHash}`,
  });
  await verifyMoneyMovementLeg(ensured.movement.reference, prepared.leg.id, { amountMicros });
  return completeMoneyMovement(ensured.movement.reference, { amountMicros });
}

/** Read the current movement without exposing database details to watchers. */
export async function observedArcDepositByReference(reference: string) {
  return currentMoneyMovement(reference);
}
