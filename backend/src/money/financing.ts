import { erc20Abi, formatUnits, parseEventLogs } from 'viem';
import { publicClient } from '../chain/client.js';
import { config } from '../config.js';
import { listMoneyMovementsForJob } from '../db/moneyMovements.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { formatUsdcMicros, parseUsdcMicros, type MoneyMovement } from './model.js';
import { completeMoneyMovement, prepareMoneyMovementContractLeg, verifyMoneyMovementLeg } from './service.js';

export type FinancingMovementKind = 'financing_advance' | 'financing_repayment';

const assignmentAbi = [{
  type: 'function',
  name: 'assignmentOf',
  stateMutability: 'view',
  inputs: [{ name: 'jobId', type: 'bytes32' }],
  outputs: [
    { name: 'assignee', type: 'address' },
    { name: 'amount', type: 'uint128' },
    { name: 'paid', type: 'uint128' },
  ],
}] as const;

export function financingOperationKey(rail: string, positionId: string, phase: string, txHash: string): string {
  return `financing:${rail}:${positionId}:${phase}:${txHash.toLowerCase()}`;
}

export function matchesFinancingTransfer(input: {
  tokenAddress: string;
  from?: string;
  to?: string;
  value?: bigint;
}, expected: { tokenAddress: string; sourceAddress: string; destinationAddress: string; amountMicros: bigint }): boolean {
  return input.tokenAddress.toLowerCase() === expected.tokenAddress.toLowerCase() &&
    input.from?.toLowerCase() === expected.sourceAddress.toLowerCase() &&
    input.to?.toLowerCase() === expected.destinationAddress.toLowerCase() &&
    input.value === expected.amountMicros;
}

/** Record a financing transfer only after the receipt contains the exact USDC leg. */
export async function recordVerifiedFinancingMovement(input: {
  operationKey: string;
  kind: FinancingMovementKind;
  positionId: string;
  amountUsdc: string;
  initiatedBy: string;
  sourceAddress: string;
  destinationAddress: string;
  txHash: string;
  contractAddress?: string;
  summary: string;
}): Promise<MoneyMovement> {
  const amountMicros = parseUsdcMicros(input.amountUsdc);
  const usdcAddress = config.USDC_ADDR;
  if (!usdcAddress) throw new Error('USDC_ADDR is not configured');
  const ensured = await ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: input.kind,
    amountMicros,
    jobId: input.positionId,
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.sourceAddress, role: 'source' },
      { address: input.destinationAddress, role: 'recipient' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
  });
  if (ensured.movement.state === 'completed') return ensured.movement;
  const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash as `0x${string}` });
  if (receipt.status !== 'success') throw new Error('financing transaction reverted');
  if (input.contractAddress && (receipt.to ?? '').toLowerCase() !== input.contractAddress.toLowerCase()) throw new Error('financing receipt target mismatch');
  const transfer = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false })
    .map((entry) => ({ tokenAddress: entry.address, ...(entry.args as { from?: string; to?: string; value?: bigint }) }))
    .find((entry) => matchesFinancingTransfer(entry, { tokenAddress: usdcAddress, sourceAddress: input.sourceAddress, destinationAddress: input.destinationAddress, amountMicros }));
  if (!transfer) throw new Error('financing receipt has no exact USDC transfer');
  const prepared = await prepareMoneyMovementContractLeg(ensured.movement.reference, {
    key: input.kind === 'financing_advance' ? 'advance' : 'repayment',
    label: input.kind === 'financing_advance' ? 'Financing advance transfer' : 'Financing repayment transfer',
    rail: 'arc_contract',
    signerAddress: input.initiatedBy,
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    contractAddress: input.contractAddress,
    amountMicros,
  });
  await prepared.lifecycle.onSubmitted?.({ txId: input.txHash, estimatedFee: null });
  await prepared.lifecycle.onConfirmed?.({ txId: input.txHash, txHash: input.txHash, explorerUrl: `${config.ARC_TESTNET_EXPLORER_URL}/tx/${input.txHash}` });
  await verifyMoneyMovementLeg(ensured.movement.reference, prepared.leg.id, { amountMicros });
  return completeMoneyMovement(ensured.movement.reference, { amountMicros });
}

export function financingAmount(value: bigint): string {
  return formatUsdcMicros(value);
}

/** Read the amount an escrow assignment has actually paid to its assignee. */
export async function readEscrowAssignmentPaid(jobId: string): Promise<bigint> {
  if (!config.KARWAN_ESCROW_ADDR) return 0n;
  const result = await publicClient.readContract({
    address: config.KARWAN_ESCROW_ADDR as `0x${string}`,
    abi: assignmentAbi,
    functionName: 'assignmentOf',
    args: [jobId as `0x${string}`],
  });
  return (result as readonly [string, bigint, bigint])[2];
}

/**
 * Map a repayment already paid from escrow to the financier. The assignment
 * counter is not a receipt: an exact USDC Transfer in a real milestone tx is
 * still required before this movement can complete.
 */
export async function recordEscrowAssignedFinancingMovement(input: {
  operationKey: string;
  positionId: string;
  amountMicros: bigint;
  initiatedBy: string;
  financierAddress: string;
  jobId: string;
  summary: string;
}): Promise<{ movement: MoneyMovement; txHash: string }> {
  const escrowAddress = config.KARWAN_ESCROW_ADDR;
  const usdcAddress = config.USDC_ADDR;
  if (!escrowAddress || !usdcAddress) throw new Error('escrow or USDC address is not configured');
  const movements = await listMoneyMovementsForJob(input.jobId, 100);
  const candidates = movements
    .filter((movement) => movement.state !== 'cancelled')
    .flatMap((movement) => movement.legs
      .filter((leg) => leg.attempt === movement.attempt && !!leg.txHash)
      .map((leg) => leg.txHash!));
  for (const txHash of [...new Set(candidates)]) {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== 'success') continue;
    const exactPayout = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false })
      .find((entry) => {
        if (entry.address.toLowerCase() !== usdcAddress.toLowerCase()) return false;
        const args = entry.args as { from?: string; to?: string; value?: bigint };
        return args.from?.toLowerCase() === escrowAddress.toLowerCase() &&
          args.to?.toLowerCase() === input.financierAddress.toLowerCase() &&
          args.value === input.amountMicros;
      });
    if (!exactPayout) continue;
    const movement = await recordVerifiedFinancingMovement({
      operationKey: input.operationKey,
      kind: 'financing_repayment',
      positionId: input.positionId,
      amountUsdc: formatUnits(input.amountMicros, 6),
      initiatedBy: input.initiatedBy,
      sourceAddress: escrowAddress,
      destinationAddress: input.financierAddress,
      txHash,
      contractAddress: escrowAddress,
      summary: input.summary,
    });
    return { movement, txHash };
  }
  throw new Error('escrow reports repayment but no exact escrow-to-financier payout proof is recorded');
}
