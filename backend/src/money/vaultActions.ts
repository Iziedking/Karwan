import { erc20Abi, parseEventLogs } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros } from './model.js';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
  prepareMoneyMovementContractLeg,
  verifyMoneyMovementLeg,
} from './service.js';

export type VaultAction = 'requestWithdraw' | 'cancelWithdraw' | 'claim';

export const vaultActionEventAbi = [
  { type: 'event', name: 'WithdrawalRequested', inputs: [{ name: 'positionId', type: 'uint256', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'claimableAt', type: 'uint64', indexed: false }] },
  { type: 'event', name: 'WithdrawalCancelled', inputs: [{ name: 'positionId', type: 'uint256', indexed: true }, { name: 'owner', type: 'address', indexed: true }] },
  { type: 'event', name: 'Claimed', inputs: [{ name: 'positionId', type: 'uint256', indexed: true }, { name: 'owner', type: 'address', indexed: true }, { name: 'principal', type: 'uint256', indexed: false }] },
] as const;

export function vaultActionOperationKey(owner: string, action: VaultAction, positionId: string, requestId: string): string {
  return `vault:${action}:${owner.toLowerCase()}:${positionId}:${requestId}`;
}

export async function prepareWeb3VaultActionIntent(input: {
  operationKey: string;
  action: VaultAction;
  ownerAddress: string;
  vaultAddress: string;
  positionId: string;
  amountMicros: bigint;
}) {
  const ensured = await ensureVaultActionMovement(input);
  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, {
    key: 'vault_action',
    label: `Browser wallet Vault ${input.action}`,
    rail: 'arc_contract',
    signerAddress: input.ownerAddress,
    sourceAddress: input.action === 'claim' ? input.vaultAddress : input.ownerAddress,
    destinationAddress: input.action === 'claim' ? input.ownerAddress : input.vaultAddress,
    contractAddress: input.vaultAddress,
    amountMicros: input.amountMicros,
  });
  return { movement: prepared.movement };
}

export async function completeWeb3VaultAction(input: {
  reference: string;
  action: VaultAction;
  ownerAddress: string;
  vaultAddress: string;
  usdcAddress: string;
  positionId: string;
  amountMicros: bigint;
  txHash: string;
}) {
  const movement = await currentMoneyMovement(input.reference);
  if (movement.state === 'completed') return movement;
  const prepared = movement.legs.find((leg) => leg.attempt === movement.attempt && leg.key === 'vault_action');
  if (!prepared) throw new Error('vault action intent is not prepared');
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
    if (receipt.status !== 'success' || (receipt.to ?? '').toLowerCase() !== input.vaultAddress.toLowerCase() || (receipt.from ?? '').toLowerCase() !== input.ownerAddress.toLowerCase()) throw new Error('vault action transaction proof failed');
    const decoded = parseEventLogs({ abi: vaultActionEventAbi, eventName: input.action === 'requestWithdraw' ? 'WithdrawalRequested' : input.action === 'cancelWithdraw' ? 'WithdrawalCancelled' : 'Claimed', logs: receipt.logs, strict: false });
    const event = decoded.find((entry) => {
      const args = entry.args as { owner?: string; positionId?: bigint; principal?: bigint };
      return args.owner?.toLowerCase() === input.ownerAddress.toLowerCase() && args.positionId === BigInt(input.positionId) && (input.action !== 'claim' || args.principal === input.amountMicros);
    });
    if (!event) throw new Error('vault action event does not match the position');
    if (input.action === 'claim') {
      const payout = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false }).find((entry) => {
        if (entry.address.toLowerCase() !== input.usdcAddress.toLowerCase()) return false;
        const args = entry.args as { from?: string; to?: string; value?: bigint };
        return args.from?.toLowerCase() === input.vaultAddress.toLowerCase() && args.to?.toLowerCase() === input.ownerAddress.toLowerCase() && args.value === input.amountMicros;
      });
      if (!payout) throw new Error('vault claim has no exact USDC payout');
    }
    const plan = await prepareMoneyMovementContractLeg(input.reference, {
      key: 'vault_action', label: `Browser wallet Vault ${input.action}`, rail: 'arc_contract',
      signerAddress: input.ownerAddress,
      sourceAddress: input.action === 'claim' ? input.vaultAddress : input.ownerAddress,
      destinationAddress: input.action === 'claim' ? input.ownerAddress : input.vaultAddress,
      contractAddress: input.vaultAddress,
      amountMicros: input.amountMicros,
    });
    await plan.lifecycle.onSubmitted?.({ txId: input.txHash, estimatedFee: null });
    await plan.lifecycle.onConfirmed?.({ txId: input.txHash, txHash: input.txHash, explorerUrl: vaultActionExplorerUrl(input.txHash) });
    await verifyMoneyMovementLeg(input.reference, prepared.id, { amountMicros: input.amountMicros });
    return completeMoneyMovement(input.reference, { amountMicros: input.amountMicros });
  } catch (error) {
    await markMoneyMovementNeedsAttention(input.reference, `VAULT_${input.action.toUpperCase()}_PROOF_MISMATCH`);
    throw error;
  }
}

export async function ensureVaultActionMovement(input: {
  operationKey: string;
  action: VaultAction;
  ownerAddress: string;
  vaultAddress: string;
  positionId: string;
  amountMicros: bigint;
}) {
  const amount = formatUsdcMicros(input.amountMicros);
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: input.action === 'claim' ? 'cash_out' : 'stake',
    amountMicros: input.amountMicros,
    initiatedBy: input.ownerAddress,
    participants: [
      { address: input.ownerAddress, role: 'owner' },
      { address: input.vaultAddress, role: 'source' },
      { address: input.ownerAddress, role: 'recipient' },
    ],
    summary:
      input.action === 'claim'
        ? `Claimed ${amount} USDC from Karwan Vault`
        : input.action === 'requestWithdraw'
          ? `Started unstaking ${amount} USDC from Karwan Vault`
          : `Cancelled unstaking ${amount} USDC in Karwan Vault`,
    nextActor: 'karwan',
  });
}

export async function executeVaultActionMovement(input: {
  reference: string;
  action: VaultAction;
  ownerAddress: string;
  vaultAddress: string;
  usdcAddress: string;
  positionId: string;
  amountMicros: bigint;
  walletId: string;
  signature: string;
  execute: (options: {
    walletId: string;
    idempotencyKey: string;
    lifecycle: Awaited<ReturnType<typeof prepareMoneyMovementContractLeg>>['lifecycle'];
  }) => Promise<{ txHash: string }>;
}) {
  const movement = await currentMoneyMovement(input.reference);
  if (movement.state === 'completed') return { movement, txHash: movement.legs.find((leg) => leg.key === 'vault_action')?.txHash ?? null };
  const prepared = await prepareMoneyMovementContractLeg(input.reference, {
    key: 'vault_action',
    label: `Karwan Vault ${input.action}`,
    rail: 'circle_wallets',
    walletId: input.walletId,
    signerAddress: input.ownerAddress,
    sourceAddress: input.action === 'claim' ? input.vaultAddress : input.ownerAddress,
    destinationAddress: input.action === 'claim' ? input.ownerAddress : input.vaultAddress,
    contractAddress: input.vaultAddress,
    amountMicros: input.amountMicros,
  });
  if (prepared.leg.state === 'verified') return { movement: prepared.movement, txHash: prepared.leg.txHash ?? null };
  try {
    const result = await input.execute({ walletId: input.walletId, idempotencyKey: prepared.idempotencyKey, lifecycle: prepared.lifecycle });
    const receipt = await publicClient.getTransactionReceipt({ hash: result.txHash as `0x${string}` });
    if (receipt.status !== 'success' || (receipt.to ?? '').toLowerCase() !== input.vaultAddress.toLowerCase() || (receipt.from ?? '').toLowerCase() !== input.ownerAddress.toLowerCase()) throw new Error('vault action transaction proof failed');
    const decoded = parseEventLogs({ abi: vaultActionEventAbi, eventName: input.action === 'requestWithdraw' ? 'WithdrawalRequested' : input.action === 'cancelWithdraw' ? 'WithdrawalCancelled' : 'Claimed', logs: receipt.logs, strict: false });
    const event = decoded.find((entry) => {
      const args = entry.args as { owner?: string; positionId?: bigint; principal?: bigint };
      return args.owner?.toLowerCase() === input.ownerAddress.toLowerCase() && args.positionId === BigInt(input.positionId) && (input.action !== 'claim' || args.principal === input.amountMicros);
    });
    if (!event) throw new Error('vault action event does not match the position');
    if (input.action === 'claim') {
      const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false }).filter((entry) => entry.address.toLowerCase() === input.usdcAddress.toLowerCase());
      const payout = transfers.find((entry) => {
        const args = entry.args as { from?: string; to?: string; value?: bigint };
        return args.from?.toLowerCase() === input.vaultAddress.toLowerCase() && args.to?.toLowerCase() === input.ownerAddress.toLowerCase() && args.value === input.amountMicros;
      });
      if (!payout) throw new Error('vault claim has no exact USDC payout');
    }
    await verifyMoneyMovementLeg(input.reference, prepared.leg.id, { amountMicros: input.amountMicros });
    return { movement: await completeMoneyMovement(input.reference, { amountMicros: input.amountMicros }), txHash: result.txHash };
  } catch (error) {
    await markMoneyMovementNeedsAttention(input.reference, `VAULT_${input.action.toUpperCase()}_PROOF_MISMATCH`);
    throw error;
  }
}

export function vaultActionExplorerUrl(txHash: string): string {
  return `${config.ARC_TESTNET_EXPLORER_URL}/tx/${txHash}`;
}
