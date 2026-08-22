import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros, parseUsdcMicros } from './model.js';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { erc20Abi, parseEventLogs } from 'viem';
import { executeContractCall } from '../chain/txs.js';

export const vaultDepositEventAbi = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'principal', type: 'uint256', indexed: false },
    ],
  },
] as const;

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

export interface VaultStakeApprovalProof {
  tokenAddress: string;
  owner?: string;
  spender?: string;
  value?: bigint;
}

export function proveVaultStakeApproval(input: {
  receiptTo: string | null | undefined;
  receiptFrom: string | null | undefined;
  usdcAddress: string;
  ownerAddress: string;
  vaultAddress: string;
  expectedAmountMicros: bigint;
  approvals: readonly VaultStakeApprovalProof[];
}): void {
  const owner = input.ownerAddress.toLowerCase();
  const vault = input.vaultAddress.toLowerCase();
  if ((input.receiptTo ?? '').toLowerCase() !== input.usdcAddress.toLowerCase()) {
    throw new Error('approval receipt target does not match USDC');
  }
  if ((input.receiptFrom ?? '').toLowerCase() !== owner) {
    throw new Error('approval receipt sender does not match the wallet');
  }
  const matches = input.approvals.filter(
    (entry) =>
      entry.tokenAddress.toLowerCase() === input.usdcAddress.toLowerCase() &&
      entry.owner?.toLowerCase() === owner &&
      entry.spender?.toLowerCase() === vault &&
      entry.value === input.expectedAmountMicros,
  );
  if (matches.length !== 1) {
    throw new Error('approval receipt has no unique allowance for the vault');
  }
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

function currentLegHash(
  movement: Awaited<ReturnType<typeof currentMoneyMovement>>,
  key: string,
): string | null {
  return movement.legs.find((leg) => leg.attempt === movement.attempt && leg.key === key)?.txHash ?? null;
}

async function verifyCircleApproval(input: {
  reference: string;
  legId: string;
  txHash: string;
  ownerAddress: string;
  vaultAddress: string;
  usdcAddress: string;
  amountMicros: bigint;
}): Promise<void> {
  const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
  const approvals = parseEventLogs({
    abi: erc20Abi,
    eventName: 'Approval',
    logs: receipt.logs,
    strict: false,
  }).map((entry) => ({
    tokenAddress: entry.address,
    ...(entry.args as { owner?: string; spender?: string; value?: bigint }),
  }));
  proveVaultStakeApproval({
    receiptTo: receipt.to,
    receiptFrom: receipt.from,
    usdcAddress: input.usdcAddress,
    ownerAddress: input.ownerAddress,
    vaultAddress: input.vaultAddress,
    expectedAmountMicros: input.amountMicros,
    approvals,
  });
  await verifyMoneyMovementLeg(input.reference, input.legId, { amountMicros: input.amountMicros });
}

async function verifyCircleDeposit(input: {
  reference: string;
  legId: string;
  txHash: string;
  ownerAddress: string;
  vaultAddress: string;
  usdcAddress: string;
  amountMicros: bigint;
}): Promise<bigint> {
  const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
  const transfers = parseEventLogs({
    abi: erc20Abi,
    eventName: 'Transfer',
    logs: receipt.logs,
    strict: false,
  }).map((entry) => ({
    tokenAddress: entry.address,
    ...(entry.args as { from?: string; to?: string; value?: bigint }),
  }));
  const deposits = parseEventLogs({
    abi: vaultDepositEventAbi,
    eventName: 'Deposited',
    logs: receipt.logs,
    strict: false,
  }).map((entry) => entry.args as { owner?: string; principal?: bigint; positionId?: bigint });
  const proof = proveVaultStake({
    receiptTo: receipt.to,
    receiptFrom: receipt.from,
    vaultAddress: input.vaultAddress,
    ownerAddress: input.ownerAddress,
    usdcAddress: input.usdcAddress,
    expectedAmountMicros: input.amountMicros,
    transfers,
    deposits,
  });
  await verifyMoneyMovementLeg(input.reference, input.legId, { amountMicros: proof.amountMicros });
  return proof.positionId ?? 0n;
}

/** Execute the Circle identity-wallet two-leg staking rail with one receipt. */
export async function executeCircleVaultStake(input: {
  operationKey: string;
  ownerAddress: string;
  walletId: string;
  vaultAddress: string;
  usdcAddress: string;
  amountMicros: bigint;
}) {
  const amount = formatUsdcMicros(input.amountMicros);
  const ensured = await ensureMoneyMovement({
    operationKey: input.operationKey,
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
  const reference = ensured.movement.reference;
  if (ensured.movement.state === 'completed') {
    return { movement: ensured.movement, approveTxHash: currentLegHash(ensured.movement, 'approve'), depositTxHash: currentLegHash(ensured.movement, 'deposit'), positionId: null };
  }
  if (ensured.movement.state === 'needs_attention') {
    throw new Error(`vault stake needs attention (${reference})`);
  }

  const approve = await prepareMoneyMovementContractLeg(reference, {
    key: 'approve',
    label: 'Circle vault USDC approval',
    rail: 'circle_wallets',
    walletId: input.walletId,
    signerAddress: input.ownerAddress,
    sourceAddress: input.ownerAddress,
    destinationAddress: input.vaultAddress,
    contractAddress: input.usdcAddress,
    amountMicros: input.amountMicros,
  });
  let approveTxHash = currentLegHash(approve.movement, 'approve');
  if (approve.leg.state !== 'verified') {
    const result = await executeContractCall(
      {
        walletId: input.walletId,
        contractAddress: input.usdcAddress,
        abiFunctionSignature: 'approve(address,uint256)',
        abiParameters: [input.vaultAddress, input.amountMicros.toString()],
        idempotencyKey: approve.idempotencyKey,
        lifecycle: approve.lifecycle,
      },
      'vault.approve',
    );
    approveTxHash = result.txHash;
    try {
      await verifyCircleApproval({
        reference,
        legId: approve.leg.id,
        txHash: result.txHash,
        ownerAddress: input.ownerAddress,
        vaultAddress: input.vaultAddress,
        usdcAddress: input.usdcAddress,
        amountMicros: input.amountMicros,
      });
    } catch (err) {
      await markMoneyMovementNeedsAttention(reference, 'VAULT_APPROVAL_PROOF_MISMATCH');
      throw err;
    }
  }

  const deposit = await prepareMoneyMovementContractLeg(reference, {
    key: 'deposit',
    label: 'Circle vault USDC deposit',
    rail: 'circle_wallets',
    walletId: input.walletId,
    signerAddress: input.ownerAddress,
    sourceAddress: input.ownerAddress,
    destinationAddress: input.vaultAddress,
    contractAddress: input.vaultAddress,
    amountMicros: input.amountMicros,
  });
  let depositTxHash = currentLegHash(deposit.movement, 'deposit');
  let positionId: bigint | null = null;
  if (deposit.leg.state !== 'verified') {
    const result = await executeContractCall(
      {
        walletId: input.walletId,
        contractAddress: input.vaultAddress,
        abiFunctionSignature: 'deposit(uint256)',
        abiParameters: [input.amountMicros.toString()],
        idempotencyKey: deposit.idempotencyKey,
        lifecycle: deposit.lifecycle,
      },
      'vault.deposit',
    );
    depositTxHash = result.txHash;
    try {
      positionId = await verifyCircleDeposit({
        reference,
        legId: deposit.leg.id,
        txHash: result.txHash,
        ownerAddress: input.ownerAddress,
        vaultAddress: input.vaultAddress,
        usdcAddress: input.usdcAddress,
        amountMicros: input.amountMicros,
      });
    } catch (err) {
      await markMoneyMovementNeedsAttention(reference, 'VAULT_DEPOSIT_PROOF_MISMATCH');
      throw err;
    }
  }

  const movement = await completeMoneyMovement(reference, { amountMicros: input.amountMicros });
  return { movement, approveTxHash, depositTxHash, positionId };
}

/** Parse a client amount only as a comparison hint, never as the source of truth. */
export function parseVaultStakeHint(value: number | string): bigint {
  return parseUsdcMicros(String(value));
}
