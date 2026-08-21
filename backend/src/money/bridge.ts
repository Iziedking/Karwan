import {
  ensureMoneyMovement,
} from '../db/moneyMovements.js';
import { parseUsdcMicros, type MoneyMovement, type MoneyMovementParty } from './model.js';

/**
 * Input for a bridge movement that is being recorded after a client-side
 * wallet/forwarder flow. The bridge itself may already have happened on-chain,
 * but the product receipt must still be allocated before we persist the
 * projection and must remain pending until the supplied proofs are attached.
 */
export interface BridgeMovementInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  recipient: string;
  summary: string;
  sourceAddress?: string;
}

export async function ensureBridgeMovement(
  input: BridgeMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  const participants: MoneyMovementParty[] = [
    { address: input.initiatedBy, role: 'owner' as const },
    { address: input.recipient, role: 'recipient' as const },
  ];
  if (input.sourceAddress) {
    participants.push({ address: input.sourceAddress, role: 'source' as const });
  }

  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'bridge',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants,
    summary: input.summary,
    nextActor: 'karwan',
  });
}
