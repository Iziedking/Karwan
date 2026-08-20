import {
  beginOrResumeMoneyMovement,
  completeMoneyMovement,
  currentMoneyMovement,
} from './service.js';
import {
  ensureMoneyMovement,
  updateMoneyMovement,
} from '../db/moneyMovements.js';
import {
  canTransitionMovement,
  parseUsdcMicros,
  planMoneyMovementLeg,
  transitionMoneyMovement,
  transitionMoneyMovementLeg,
  type MoneyMovement,
  type MoneyMovementLeg,
  type MoneyMovementRail,
} from './model.js';

export interface CashoutMovementInput {
  operationKey: string;
  amountUsdc: string;
  initiatedBy: string;
  recipient: string;
  summary: string;
  jobId?: string;
}

export async function ensureCashoutMovement(
  input: CashoutMovementInput,
): Promise<{ movement: MoneyMovement; created: boolean }> {
  return ensureMoneyMovement({
    operationKey: input.operationKey,
    kind: 'cash_out',
    amountMicros: parseUsdcMicros(input.amountUsdc),
    initiatedBy: input.initiatedBy,
    participants: [
      { address: input.initiatedBy, role: 'owner' },
      { address: input.recipient, role: 'recipient' },
    ],
    summary: input.summary,
    nextActor: 'karwan',
    ...(input.jobId ? { jobId: input.jobId } : {}),
  });
}

export async function prepareCashoutLeg(
  reference: string,
  input: {
    key: string;
    label: string;
    rail: MoneyMovementRail;
    amountMicros?: string;
    walletId?: string;
    signerAddress?: string;
    sourceAddress?: string;
    destinationAddress?: string;
    contractAddress?: string;
  },
): Promise<{ movement: MoneyMovement; leg: MoneyMovementLeg }> {
  await beginOrResumeMoneyMovement(reference);
  const movement = await updateMoneyMovement(reference, (current) =>
    planMoneyMovementLeg(current, input),
  );
  const leg = movement.legs.find(
    (candidate) => candidate.attempt === movement.attempt && candidate.key === input.key,
  );
  if (!leg) throw new Error(`cash-out movement leg missing: ${input.key}`);
  return { movement, leg };
}

export async function recordCashoutLeg(
  reference: string,
  key: string,
  input: {
    txHash?: string;
    providerId?: string;
    submitted?: boolean;
    failureCode?: string;
  },
): Promise<MoneyMovement> {
  const movement = await updateMoneyMovement(reference, (current) => {
    const active = current.legs.find(
      (candidate) => candidate.attempt === current.attempt && candidate.key === key,
    );
    if (!active) throw new Error(`cash-out movement leg missing: ${key}`);
    let next = current;

    if (input.failureCode) {
      if (active.state !== 'failed') {
        if (active.state === 'planned') {
          next = transitionMoneyMovementLeg(next, active.id, 'failed', {
            failureCode: input.failureCode,
          });
        } else if (active.state === 'submitted' || active.state === 'confirmed') {
          next = transitionMoneyMovementLeg(next, active.id, 'failed', {
            failureCode: input.failureCode,
          });
        }
      }
      if (canTransitionMovement(next.state, 'needs_attention')) {
        next = transitionMoneyMovement(next, 'needs_attention', {
          failureCode: input.failureCode,
          nextActor: 'karwan',
        });
      }
      return next;
    }

    const currentLeg = next.legs.find((candidate) => candidate.id === active.id)!;
    if (input.submitted && currentLeg.state === 'planned') {
      next = transitionMoneyMovementLeg(next, active.id, 'submitted', {
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
    }
    let leg = next.legs.find((candidate) => candidate.id === active.id)!;
    if (input.txHash && leg.state === 'submitted') {
      next = transitionMoneyMovementLeg(next, active.id, 'confirmed', {
        txHash: input.txHash,
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
      leg = next.legs.find((candidate) => candidate.id === active.id)!;
    }
    if (input.txHash && leg.state === 'planned') {
      next = transitionMoneyMovementLeg(next, active.id, 'submitted', {
        txHash: input.txHash,
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
      next = transitionMoneyMovementLeg(next, active.id, 'confirmed', {
        txHash: input.txHash,
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
      leg = next.legs.find((candidate) => candidate.id === active.id)!;
    }
    if (input.txHash && leg.state === 'confirmed') {
      next = transitionMoneyMovementLeg(next, active.id, 'verified', {
        txHash: input.txHash,
        ...(input.providerId ? { providerId: input.providerId } : {}),
      });
    }
    if (input.submitted || input.txHash) {
      if (next.state === 'preparing') {
        next = transitionMoneyMovement(next, 'submitted', { nextActor: 'karwan' });
      }
      if (input.txHash && canTransitionMovement(next.state, 'verifying')) {
        next = transitionMoneyMovement(next, 'verifying', { nextActor: 'karwan' });
      }
    }
    return next;
  });

  return completeCashoutWhenVerified(movement);
}

async function completeCashoutWhenVerified(movement: MoneyMovement): Promise<MoneyMovement> {
  if (movement.state === 'completed' || movement.state === 'cancelled') return movement;
  const activeLegs = movement.legs.filter((leg) => leg.attempt === movement.attempt);
  if (activeLegs.length === 0 || activeLegs.some((leg) => leg.state !== 'verified')) {
    return movement;
  }
  return completeMoneyMovement(movement.reference);
}

export async function markCashoutFailed(
  reference: string,
  failureCode: string,
  key?: string,
): Promise<MoneyMovement> {
  if (key) return recordCashoutLeg(reference, key, { failureCode });
  const movement = await currentMoneyMovement(reference);
  if (movement.state === 'completed' || movement.state === 'cancelled') return movement;
  return updateMoneyMovement(reference, (current) =>
    canTransitionMovement(current.state, 'needs_attention')
      ? transitionMoneyMovement(current, 'needs_attention', {
          failureCode,
          nextActor: 'karwan',
        })
      : current,
  );
}
