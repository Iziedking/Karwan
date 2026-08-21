import type { ContractCallLifecycle } from '../chain/txs.js';
import {
  ensureMoneyMovement,
  getMoneyMovement,
  updateMoneyMovement,
} from '../db/moneyMovements.js';
import {
  canTransitionMovement,
  planMoneyMovementLeg,
  shouldReuseMoneyMovementAttempt,
  startMoneyMovementAttempt,
  transitionMoneyMovement,
  transitionMoneyMovementAndLeg,
  transitionMoneyMovementLeg,
  hasOnchainProof,
  type CreateMoneyMovementInput,
  type MoneyMovement,
  type MoneyMovementLeg,
  type PlanMovementLegInput,
} from './model.js';

export { ensureMoneyMovement };
export type { CreateMoneyMovementInput, MoneyMovement };

export async function beginOrResumeMoneyMovement(reference: string): Promise<MoneyMovement> {
  return updateMoneyMovement(reference, (current) => {
    if (current.state === 'created') {
      return startMoneyMovementAttempt(current);
    }
    if (current.state === 'needs_attention') {
      return shouldReuseMoneyMovementAttempt(current)
        ? transitionMoneyMovement(current, 'preparing', {
            nextActor: 'karwan',
            failureCode: undefined,
          })
        : startMoneyMovementAttempt(current);
    }
    if (current.state === 'submitted' || current.state === 'verifying') {
      return transitionMoneyMovement(current, 'preparing', { nextActor: 'karwan' });
    }
    if (current.state === 'preparing' || current.state === 'completed') return current;
    throw new Error(`cannot resume ${current.state} movement`);
  });
}

export interface PlannedContractLeg {
  movement: MoneyMovement;
  leg: MoneyMovementLeg;
  idempotencyKey: string;
  lifecycle: ContractCallLifecycle;
}

export async function prepareMoneyMovementContractLeg(
  reference: string,
  input: PlanMovementLegInput,
): Promise<PlannedContractLeg> {
  await beginOrResumeMoneyMovement(reference);
  const movement = await updateMoneyMovement(reference, (current) =>
    planMoneyMovementLeg(current, input),
  );
  const leg = movement.legs.find(
    (candidate) => candidate.attempt === movement.attempt && candidate.key === input.key,
  );
  if (!leg) throw new Error(`planned movement leg missing: ${input.key}`);

  return {
    movement,
    leg,
    idempotencyKey: leg.idempotencyKey,
    lifecycle: {
      onSubmitted: async ({ txId }) => {
        await updateMoneyMovement(reference, (current) => {
          const active = current.legs.find((candidate) => candidate.id === leg.id);
          if (!active || active.state === 'confirmed' || active.state === 'verified') return current;
          if (active.state === 'submitted' && active.providerId === txId) return current;
          if (active.providerId && active.providerId !== txId) {
            throw new Error(`provider transaction changed for movement leg ${leg.id}`);
          }
          return transitionMoneyMovementAndLeg(
            current,
            'submitted',
            leg.id,
            'submitted',
            { providerId: txId },
          );
        });
      },
      onConfirmed: async ({ txId, txHash, explorerUrl }) => {
        await updateMoneyMovement(reference, (current) => {
          const active = current.legs.find((candidate) => candidate.id === leg.id);
          if (!active || active.state === 'verified') return current;
          if (active.state === 'confirmed' && active.txHash === txHash) return current;
          if (active.providerId && active.providerId !== txId) {
            throw new Error(`provider transaction changed for movement leg ${leg.id}`);
          }
          if (active.txHash && active.txHash !== txHash) {
            throw new Error(`transaction hash changed for movement leg ${leg.id}`);
          }
          return transitionMoneyMovementAndLeg(
            current,
            'verifying',
            leg.id,
            'confirmed',
            { providerId: txId, txHash, explorerUrl },
          );
        });
      },
      onFailed: async ({ state, error }) => {
        await updateMoneyMovement(reference, (current) => {
          const active = current.legs.find((candidate) => candidate.id === leg.id);
          if (!active || active.state === 'verified' || active.state === 'confirmed') {
            if (current.state === 'needs_attention') return current;
            return canTransitionMovement(current.state, 'needs_attention')
              ? transitionMoneyMovement(current, 'needs_attention', {
                  failureCode: state ?? 'TRANSACTION_FAILED',
                  nextActor: 'karwan',
                })
              : current;
          }
          const failureCode = state ?? 'STATUS_UNCONFIRMED';
          const terminalProviderFailure =
            state === 'FAILED' ||
            state === 'DENIED' ||
            state === 'CANCELLED' ||
            error.message.includes('reverted on chain');
          return transitionMoneyMovementAndLeg(
            current,
            'needs_attention',
            leg.id,
            terminalProviderFailure ? 'failed' : active.state,
            terminalProviderFailure ? { failureCode } : {},
            { failureCode, nextActor: 'karwan' },
          );
        });
      },
    },
  };
}

export async function verifyMoneyMovementLeg(
  reference: string,
  legId: string,
  patch: { amountMicros?: bigint | string } = {},
): Promise<MoneyMovement> {
  return updateMoneyMovement(reference, (current) => {
    const leg = current.legs.find((candidate) => candidate.id === legId);
    if (!leg) throw new Error(`movement leg not found: ${legId}`);
    if (leg.state === 'verified') return current;
    return transitionMoneyMovementLeg(
      current,
      legId,
      'verified',
      patch.amountMicros != null ? { amountMicros: BigInt(patch.amountMicros).toString() } : {},
    );
  });
}

export async function verifyConfirmedMoneyMovementLegByKey(
  reference: string,
  key: string,
  patch: { amountMicros?: bigint | string } = {},
): Promise<MoneyMovement> {
  const movement = await currentMoneyMovement(reference);
  const leg = movement.legs.find(
    (candidate) => candidate.attempt === movement.attempt && candidate.key === key,
  );
  if (!leg || leg.state === 'verified') return movement;
  if (leg.state !== 'confirmed') return movement;
  return verifyMoneyMovementLeg(reference, leg.id, patch);
}

export async function markMoneyMovementVerifying(reference: string): Promise<MoneyMovement> {
  let movement = await currentMoneyMovement(reference);
  if (movement.state === 'completed') return movement;
  if (movement.state === 'needs_attention' || movement.state === 'created') {
    movement = await beginOrResumeMoneyMovement(reference);
  }
  if (movement.state === 'verifying') return movement;
  return updateMoneyMovement(reference, (current) => {
    if (current.state === 'verifying' || current.state === 'completed') return current;
    return transitionMoneyMovement(current, 'verifying', { nextActor: 'karwan' });
  });
}

export async function completeMoneyMovement(
  reference: string,
  patch: { amountMicros?: bigint | string; summary?: string } = {},
): Promise<MoneyMovement> {
  return updateMoneyMovement(reference, (current) => {
    if (current.state === 'completed') return current;
    const currentAttemptLegs = current.legs.filter((leg) => leg.attempt === current.attempt);
    if (currentAttemptLegs.length === 0) {
      throw new Error('cannot complete a movement without verified proof');
    }
    if (currentAttemptLegs.some((leg) => leg.state !== 'verified')) {
      throw new Error('cannot complete a movement with unverified legs');
    }
    if (currentAttemptLegs.some((leg) => !hasOnchainProof(leg))) {
      throw new Error('cannot complete a movement without an on-chain transaction hash');
    }
    return transitionMoneyMovement(current, 'completed', {
      ...(patch.amountMicros != null ? { amountMicros: BigInt(patch.amountMicros).toString() } : {}),
      ...(patch.summary ? { summary: patch.summary } : {}),
      nextActor: 'none',
    });
  });
}

export async function markMoneyMovementNeedsAttention(
  reference: string,
  failureCode: string,
  nextActor: MoneyMovement['nextActor'] = 'karwan',
): Promise<MoneyMovement> {
  return updateMoneyMovement(reference, (current) => {
    if (current.state === 'completed' || current.state === 'cancelled') return current;
    if (current.state === 'needs_attention' && current.failureCode === failureCode) return current;
    return transitionMoneyMovement(current, 'needs_attention', { failureCode, nextActor });
  });
}

export async function currentMoneyMovement(reference: string): Promise<MoneyMovement> {
  const movement = await getMoneyMovement(reference);
  if (!movement) throw new Error(`money movement not found: ${reference}`);
  return movement;
}
