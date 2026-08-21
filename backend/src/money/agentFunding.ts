import { prepareMoneyMovementContractLeg, type MoneyMovement, type PlannedContractLeg } from './service.js';
import { ensureMoneyMovement } from '../db/moneyMovements.js';
import { parseUsdcMicros } from './model.js';

export interface AgentFundingMovementInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  sourceAddress: string;
  destinationAddress: string;
  summary: string;
}

/** Match the exact ERC-20 transfer proof expected for a browser-wallet top-up. */
export function matchesAgentFundingTransfer(
  transfer: { from?: string; to?: string; value?: bigint },
  expected: { sourceAddress: string; destinationAddress: string; amountMicros: bigint },
): boolean {
  return (
    transfer.from?.toLowerCase() === expected.sourceAddress.toLowerCase() &&
    transfer.to?.toLowerCase() === expected.destinationAddress.toLowerCase() &&
    transfer.value === expected.amountMicros
  );
}

/** Allocate the KWN receipt before an identity-to-agent transfer is submitted. */
export async function ensureAgentFundingMovement(
  input: AgentFundingMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'agent_funding',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.sourceAddress, role: 'source' },
      { address: input.destinationAddress, role: 'recipient' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
  });
}

/** Plan the verified Arc transfer leg for an identity-to-agent top-up. */
export async function prepareAgentFundingLeg(
  reference: string,
  input: {
    sourceAddress: string;
    destinationAddress: string;
    amountMicros: bigint | string;
    walletId?: string;
    signerAddress: string;
    contractAddress: string;
  },
): Promise<PlannedContractLeg> {
  return prepareMoneyMovementContractLeg(reference, {
    key: 'arc_transfer',
    label: 'Arc USDC transfer to agent',
    rail: 'circle_wallets',
    ...(input.walletId ? { walletId: input.walletId } : {}),
    signerAddress: input.signerAddress,
    sourceAddress: input.sourceAddress,
    destinationAddress: input.destinationAddress,
    contractAddress: input.contractAddress,
    amountMicros: input.amountMicros,
  });
}
