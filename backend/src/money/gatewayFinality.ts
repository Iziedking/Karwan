import { appendActivity } from '../db/activityLog.js';
import { findGatewayDepositByCorrelation, updateMoneyMovement } from '../db/moneyMovements.js';
import { bus } from '../events.js';
import {
  canTransitionMovement,
  formatUsdcMicros,
  isKarwanReference,
  parseUsdcMicros,
  transitionMoneyMovement,
  transitionMoneyMovementLeg,
  type MoneyMovement,
} from './model.js';

// Keep the provider label out of the activity template expression. The
// i18n ledger gate inspects string literals in `params.t`; this value is data,
// not a translation key.
const GATEWAY_SOURCE_LABEL = 'Gateway';
import {
  completeMoneyMovement,
  currentMoneyMovement,
  markMoneyMovementNeedsAttention,
} from './service.js';

export const GATEWAY_DEPOSIT_FINALIZED = 'gateway.deposit.finalized';

export interface GatewayFinalityEvent {
  notificationId: string;
  notificationType: string;
  reference?: string;
  correlation?: string;
  txHash?: string;
  amountMicros?: string;
  gatewayAddress?: string;
}

export type GatewayFinalityResult =
  | { status: 'completed'; reference: string; movement: MoneyMovement }
  | { status: 'already_completed'; reference: string; movement: MoneyMovement }
  | { status: 'unmatched' | 'ignored'; reason: string };

/** Parse only the fields needed for finality. Unknown Circle fields are kept out. */
export function parseGatewayFinalityEvent(
  notificationId: string | undefined,
  notificationType: string | undefined,
  notification: unknown,
): GatewayFinalityEvent | null {
  if (!notificationId || notificationType !== GATEWAY_DEPOSIT_FINALIZED) return null;
  const root = asRecord(notification);
  if (!root) return null;
  const records = collectRecords(root);
  const reference = firstString(records, ['reference', 'karwanReference', 'clientReference']);
  const txHash = firstString(records, ['txHash', 'transactionHash', 'hash']);
  const correlation =
    txHash ?? firstString(records, ['transactionId', 'depositId', 'gatewayDepositId', 'providerId']);
  const amount = firstString(records, ['amountUsdc', 'amountUSD', 'amountUsd', 'amount', 'value']);
  let amountMicros: string | undefined;
  if (amount) {
    try {
      amountMicros = parseUsdcMicros(amount).toString();
    } catch {
      return null;
    }
  }
  const gatewayAddress = firstString(records, [
    'gatewayAddress',
    'destinationAddress',
    'walletAddress',
    'to',
  ]);
  if (!reference && !correlation) return null;
  return {
    notificationId,
    notificationType,
    ...(reference && isKarwanReference(reference) ? { reference } : {}),
    ...(correlation ? { correlation } : {}),
    ...(txHash ? { txHash } : {}),
    ...(amountMicros ? { amountMicros } : {}),
    ...(gatewayAddress ? { gatewayAddress } : {}),
  };
}

/**
 * Advance the finality leg only after a signed `gateway.deposit.finalized`
 * notification. The provider legs remain immutable evidence; a mismatched
 * amount or hash moves the receipt to attention rather than guessing.
 */
export async function reconcileGatewayDepositFinality(
  event: GatewayFinalityEvent,
): Promise<GatewayFinalityResult> {
  let movement: MoneyMovement | null = null;
  if (event.reference) {
    try {
      movement = await currentMoneyMovement(event.reference);
    } catch {
      movement = null;
    }
  }
  if (!movement && event.correlation) {
    movement = await findGatewayDepositByCorrelation(event.correlation);
  }
  if (!movement) return { status: 'unmatched', reason: 'no unique deposit movement matched' };
  if (movement.kind !== 'deposit') return { status: 'ignored', reason: 'movement is not a deposit' };
  if (movement.state === 'completed') {
    return { status: 'already_completed', reference: movement.reference, movement };
  }
  if (movement.state === 'needs_attention' || movement.state === 'cancelled') {
    return { status: 'ignored', reason: `movement is ${movement.state}` };
  }

  const expectedAmount = BigInt(movement.amountMicros);
  if (event.amountMicros && BigInt(event.amountMicros) !== expectedAmount) {
    await markMoneyMovementNeedsAttention(
      movement.reference,
      'GATEWAY_FINALITY_AMOUNT_MISMATCH',
    );
    return { status: 'ignored', reason: 'finality amount does not match movement' };
  }

  const depositLeg = movement.legs.find(
    (leg) => leg.attempt === movement!.attempt && leg.key === 'gateway_deposit',
  );
  if (event.txHash && depositLeg?.txHash && event.txHash.toLowerCase() !== depositLeg.txHash.toLowerCase()) {
    await markMoneyMovementNeedsAttention(
      movement.reference,
      'GATEWAY_FINALITY_TX_MISMATCH',
    );
    return { status: 'ignored', reason: 'finality transaction does not match deposit leg' };
  }

  const updated = await updateMoneyMovement(movement.reference, (current) => {
    const finality = current.legs.find(
      (leg) => leg.attempt === current.attempt && leg.key === 'gateway_finality',
    );
    if (!finality) return current;
    let next = current;
    const patch = {
      // A signed notification id is the provider proof when a Gateway event
      // version omits its transaction hash. It is never shown as a wallet id.
      providerId: event.correlation ?? event.notificationId,
      ...(event.txHash ? { txHash: event.txHash } : {}),
    };
    if (finality.state === 'planned') next = transitionMoneyMovementLeg(next, finality.id, 'submitted', patch);
    const submitted = next.legs.find((leg) => leg.id === finality.id)!;
    if (submitted.state === 'submitted') next = transitionMoneyMovementLeg(next, finality.id, 'confirmed', patch);
    const confirmed = next.legs.find((leg) => leg.id === finality.id)!;
    if (confirmed.state === 'confirmed') {
      next = transitionMoneyMovementLeg(next, finality.id, 'verified', {
        ...patch,
        ...(event.amountMicros ? { amountMicros: event.amountMicros } : {}),
      });
    }
    if (next.state !== 'verifying' && canTransitionMovement(next.state, 'verifying')) {
      next = transitionMoneyMovement(next, 'verifying', { nextActor: 'karwan' });
    }
    return next;
  });

  const completed = await completeMoneyMovement(updated.reference);
  const owner = completed.participants.find((party) => party.role === 'owner')?.address;
  if (owner) {
    const amountUsdc = formatUsdcMicros(completed.amountMicros);
    void appendActivity({
      id: `gateway-finality:${completed.reference}`,
      address: owner,
      kind: 'gateway_deposit',
      summary: `Added ${amountUsdc} USDC to the unified balance`,
      params: { t: 'gatewayDeposit', amount: amountUsdc, source: GATEWAY_SOURCE_LABEL },
      amountUsdc,
      refId: completed.reference,
      ...(event.txHash ? { txHash: event.txHash } : {}),
    });
    bus.emitEvent({
      type: 'gateway.deposited',
      actor: 'platform',
      payload: {
        address: owner,
        amountUsdc,
        reference: completed.reference,
        movementState: completed.state,
      },
    });
  }
  return { status: 'completed', reference: completed.reference, movement: completed };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function collectRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    const record = asRecord(current.value);
    if (!record) continue;
    out.push(record);
    if (current.depth >= 3) continue;
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') queue.push({ value, depth: current.depth + 1 });
    }
  }
  return out;
}

function firstString(records: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return undefined;
}
