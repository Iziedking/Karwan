/// Deciding what to do about a money movement that never finished.
///
/// A movement completes when every leg of its current attempt reaches
/// `verified`. Until then transaction history reads IN FLIGHT, which is true
/// while a transfer is in the air and false forever after. The chain knows what
/// happened; this module turns what the chain said into an action, and it is
/// kept apart from the script that does the reading so the decisions can be
/// tested without a database or an RPC.
///
/// Nothing here writes. Every branch that is not certain returns a skip, because
/// the failure mode of a reconcile script is not missing a row, it is completing
/// a movement whose money never moved.

import type { MoneyMovement, MoneyMovementLeg, MoneyMovementState } from './model.js';

/// What a chain said about one leg's transaction.
export type LegProof =
  /// A receipt with status success.
  | { kind: 'landed'; chain: string }
  /// A receipt with status reverted.
  | { kind: 'reverted'; chain: string }
  /// It has a hash and no chain we could reach has heard of it. Not the same as
  /// a failure: an RPC that cannot see a transaction has not disproved it.
  | { kind: 'unknown' }
  /// There is no hash to check.
  | { kind: 'no-hash' };

export interface LegRepair {
  key: string;
  txHash: string;
  explorerUrl?: string;
}

export type ReconcilePlan =
  /// Walk these legs forward with the hashes they already hold.
  | { action: 'repair'; legs: LegRepair[] }
  /// Every leg is verified and the movement still is not completed. Nothing to
  /// prove, just a completion that never fired.
  | { action: 'complete' }
  /// A hashless leg that a sibling's transaction genuinely satisfies, because
  /// the two legs are one transaction. The single judgement in here, and it is
  /// gated behind a flag.
  | { action: 'adopt'; from: string; legs: LegRepair[] }
  | { action: 'skip'; reason: SkipReason };

export type SkipReason =
  /// A receipt says the transaction reverted. A failed transfer is not a record
  /// to complete.
  | 'reverted'
  /// A hash no chain could confirm.
  | 'unconfirmable'
  /// A leg is marked failed while its transaction succeeded. `failed` is
  /// terminal for a leg (LEG_TRANSITIONS in model.ts), so the only route back is
  /// a fresh attempt, which rewrites the movement's history. That is a decision,
  /// not a repair.
  | 'failed-leg-landed'
  /// A leg has no transaction and nothing here can honestly supply one.
  | 'missing-transaction'
  /// Already terminal.
  | 'terminal'
  | 'nothing-to-do';

export function activeLegs(movement: MoneyMovement): MoneyMovementLeg[] {
  return movement.legs.filter((leg) => leg.attempt === movement.attempt);
}

/// Are this movement's legs one transaction?
///
/// The shape that produced the stuck rows: a cash-out that left Arc for Arc, so
/// the burn and the mint are the same send, recorded as two legs because the
/// route planned both before it knew the chains matched. Every condition here is
/// a guard against adopting a hash onto a leg that describes a different
/// movement of money: same kind, exactly the burn and mint pair, one amount
/// between them, and a label or summary that says Arc to Arc.
export function isSameTransactionMovement(movement: MoneyMovement): boolean {
  if (movement.kind !== 'cash_out') return false;
  const active = activeLegs(movement);
  if (active.length !== 2) return false;
  const keys = active.map((leg) => leg.key).sort();
  if (keys[0] !== 'burn' || keys[1] !== 'mint') return false;
  const amounts = new Set(active.map((leg) => leg.amountMicros ?? movement.amountMicros));
  if (amounts.size !== 1) return false;
  return (
    active.some((leg) => /arc transfer/i.test(leg.label)) || /\bon arc\b/i.test(movement.summary)
  );
}

export function planReconcile(
  movement: MoneyMovement,
  proofs: ReadonlyMap<string, LegProof>,
  options: { adoptSameTx?: boolean } = {},
): ReconcilePlan {
  if (movement.state === 'completed' || movement.state === 'cancelled') {
    return { action: 'skip', reason: 'terminal' };
  }
  const active = activeLegs(movement);
  if (active.length === 0) return { action: 'skip', reason: 'nothing-to-do' };

  const proofOf = (leg: MoneyMovementLeg): LegProof =>
    leg.state === 'verified'
      ? { kind: 'landed', chain: 'already verified' }
      : proofs.get(leg.id) ?? { kind: 'unknown' };

  // Order matters. Each of these is a reason to stop, and the most serious one
  // has to win: a movement with both a reverted leg and a repairable one must
  // not be reported as repairable.
  if (active.some((leg) => leg.state === 'failed' && proofOf(leg).kind === 'landed')) {
    return { action: 'skip', reason: 'failed-leg-landed' };
  }
  if (active.some((leg) => proofOf(leg).kind === 'reverted')) {
    return { action: 'skip', reason: 'reverted' };
  }
  if (active.some((leg) => proofOf(leg).kind === 'unknown')) {
    return { action: 'skip', reason: 'unconfirmable' };
  }

  const needsWalking = active.filter((leg) => leg.state !== 'verified' && leg.txHash);
  const toRepair: LegRepair[] = needsWalking.map((leg) => ({
    key: leg.key,
    txHash: leg.txHash!,
    ...(leg.explorerUrl ? { explorerUrl: leg.explorerUrl } : {}),
  }));

  const hashless = active.filter((leg) => !leg.txHash);
  if (hashless.length > 0) {
    const sibling = active.find((leg) => leg.txHash && proofOf(leg).kind === 'landed');
    if (!sibling || !options.adoptSameTx || !isSameTransactionMovement(movement)) {
      return { action: 'skip', reason: 'missing-transaction' };
    }
    return {
      action: 'adopt',
      from: sibling.txHash!,
      legs: [
        ...toRepair,
        ...hashless.map((leg) => ({
          key: leg.key,
          txHash: sibling.txHash!,
          ...(sibling.explorerUrl ? { explorerUrl: sibling.explorerUrl } : {}),
        })),
      ],
    };
  }

  if (toRepair.length === 0) return { action: 'complete' };
  return { action: 'repair', legs: toRepair };
}

/// The states a movement has to pass through to reach completed, from where it
/// is now.
///
/// `completeMoneyMovement` transitions straight to `completed`, which only
/// MOVEMENT_TRANSITIONS accepts from `verifying`. A movement parked in
/// `needs_attention` with a verified leg therefore threw
/// "invalid movement transition needs_attention -> completed" rather than being
/// repaired, which is the exact case this whole module exists for: the leg
/// landed, the movement was marked as needing attention, and nothing walked it
/// back out.
///
/// Returned as a path rather than a single jump so every hop is one the state
/// machine already allows. An empty array means there is no route from here.
export function completionPath(from: MoneyMovementState): MoneyMovementState[] {
  switch (from) {
    case 'verifying':
      return ['completed'];
    case 'submitted':
    case 'preparing':
      return ['verifying', 'completed'];
    // Back through preparing, because that is the only way out of either.
    case 'needs_attention':
    case 'created':
      return ['preparing', 'verifying', 'completed'];
    default:
      return [];
  }
}
