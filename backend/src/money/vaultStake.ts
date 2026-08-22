import {
  completeMoneyMovement,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros, parseUsdcMicros } from './model.js';
import { config } from '../config.js';

export interface VaultStakeTransferProof {
  tokenAddress: string;
  from?: string;
  to?: string;
  value?: bigint;
}

export interface VaultStakeDepositProof {
  owner?: string;
  principal?: bigint;
  positionId?: bigint;
}

export interface VaultStakeProofInput {
  receiptTo: string | null | undefined;
  receiptFrom: string | null | undefined;
  vaultAddress: string;
  ownerAddress: string;
  usdcAddress: string;
  expectedAmountMicros?: bigint;
  transfers: readonly VaultStakeTransferProof[];
  deposits: readonly VaultStakeDepositProof[];
}

export interface VaultStakeProof {
  amountMicros: bigint;
  positionId?: bigint;
}

/**
 * A stake receipt is valid only when the outer call, ERC-20 movement, and
 * vault position event all describe the same owner, vault, and amount.
 * Checking all three prevents a successful call to an unrelated function from
 * becoming a shareable Karwan receipt.
 */
export function proveVaultStake(input: VaultStakeProofInput): VaultStakeProof {
  const vault = input.vaultAddress.toLowerCase();
  const owner = input.ownerAddress.toLowerCase();
  const usdc = input.usdcAddress.toLowerCase();
  if ((input.receiptTo ?? '').toLowerCase() !== vault) {
    throw new Error('stake receipt target does not match the vault');
  }
  if ((input.receiptFrom ?? '').toLowerCase() !== owner) {
    throw new Error('stake receipt sender does not match the wallet');
  }

  const transfers = input.transfers.filter(
    (entry) =>
      entry.tokenAddress.toLowerCase() === usdc &&
      entry.from?.toLowerCase() === owner &&
      entry.to?.toLowerCase() === vault &&
      typeof entry.value === 'bigint' &&
      entry.value > 0n,
  );
  if (transfers.length !== 1) {
    throw new Error('stake receipt has no unique USDC transfer into the vault');
  }
  const amountMicros = transfers[0]!.value!;
  if (input.expectedAmountMicros != null && input.expectedAmountMicros !== amountMicros) {
    throw new Error('stake amount does not match the on-chain transfer');
  }

  const deposits = input.deposits.filter(
    (entry) =>
      entry.owner?.toLowerCase() === owner &&
      entry.principal === amountMicros,
  );
  if (deposits.length !== 1) {
    throw new Error('stake receipt has no unique vault deposit event');
  }
  return { amountMicros, positionId: deposits[0]!.positionId };
}

export function vaultStakeOperationKey(ownerAddress: string, txHash: string): string {
  return `vault:stake:web3:${ownerAddress.toLowerCase()}:${txHash.toLowerCase()}`;
}

export async function recordVaultStakeMovement(input: {
  ownerAddress: string;
  txHash: string;
  amountMicros: bigint;
  vaultAddress: string;
}) {
  const amount = formatUsdcMicros(input.amountMicros);
  const ensured = await ensureMoneyMovement({
    operationKey: vaultStakeOperationKey(input.ownerAddress, input.txHash),
    kind: 'stake',
    amountMicros: input.amountMicros,
    initiatedBy: input.ownerAddress,
    participants: [
      { address: input.ownerAddress, role: 'owner' },
      { address: input.ownerAddress, role: 'source' },
      { address: input.vaultAddress, role: 'recipient' },
    ],
    summary: `Staked ${amount} USDC in Karwan Vault`,
    nextActor: 'karwan',
  });

  if (ensured.movement.state === 'completed') {
    return { movement: ensured.movement, created: ensured.created };
  }

  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, {
    key: 'vault_deposit',
    label: 'Arc USDC vault stake observed',
    rail: 'arc_contract',
    signerAddress: input.ownerAddress,
    sourceAddress: input.ownerAddress,
    destinationAddress: input.vaultAddress,
    contractAddress: input.vaultAddress,
    amountMicros: input.amountMicros,
  });
  await prepared.lifecycle.onSubmitted?.({ txId: input.txHash, estimatedFee: null });
  await prepared.lifecycle.onConfirmed?.({
    txId: input.txHash,
    txHash: input.txHash,
    explorerUrl: `${config.ARC_TESTNET_EXPLORER_URL}/tx/${input.txHash}`,
  });
  await verifyMoneyMovementLeg(ensured.movement.reference, prepared.leg.id, {
    amountMicros: input.amountMicros,
  });
  const movement = await completeMoneyMovement(ensured.movement.reference, {
    amountMicros: input.amountMicros,
  });
  return { movement, created: ensured.created };
}

/** Parse a client amount only as a comparison hint, never as the source of truth. */
export function parseVaultStakeHint(value: number | string): bigint {
  return parseUsdcMicros(String(value));
}
