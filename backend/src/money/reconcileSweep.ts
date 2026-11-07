/// The scheduled check on stuck money (view 67). It does only what a receipt
/// proves: a movement whose every leg landed is walked forward to completed.
/// It never cancels, never marks anything failed and never adopts a sibling's
/// transaction for a leg that has none. Those stay manual flags on
/// scripts/reconcile-stuck-movements.ts, where an operator judges them.

import type { MoneyMovement, MoneyMovementLeg } from './model.js';
import { activeLegs, planReconcile, type LegProof, type ReconcilePlan, type SkipReason } from './reconcile.js';

export interface SweepIo {
  open(): Promise<MoneyMovement[]>;
  proof(leg: MoneyMovementLeg): Promise<LegProof>;
  /// Applies a repair or completion and returns the state the movement reached.
  apply(reference: string, plan: ReconcilePlan): Promise<string>;
  /// Bridge rows still in flight while their movement is completed.
  bridgesBehind(): Promise<string[]>;
  finishBridge(bridgeId: string): Promise<void>;
}

export interface SweepLeft {
  reference: string;
  kind: string;
  state: string;
  reason: SkipReason | 'not-completed' | 'error';
  updatedAt: number;
}

export interface SweepResult {
  at: number;
  looked: number;
  young: number;
  fixed: string[];
  left: SweepLeft[];
  bridgesFinished: number;
}

export async function runReconcileSweep(io: SweepIo, opts: { now: number; olderThanMs: number }): Promise<SweepResult> {
  const cutoff = opts.now - opts.olderThanMs;
  const open = await io.open();
  const stuck = open.filter((m) => m.updatedAt <= cutoff);
  const fixed: string[] = [];
  const left: SweepLeft[] = [];
  const leave = (m: MoneyMovement, reason: SweepLeft['reason']) =>
    left.push({ reference: m.reference, kind: m.kind, state: m.state, reason, updatedAt: m.updatedAt });

  for (const movement of stuck) {
    try {
      const proofs = new Map<string, LegProof>();
      for (const leg of activeLegs(movement)) {
        if (leg.state !== 'verified') proofs.set(leg.id, await io.proof(leg));
      }
      const plan = planReconcile(movement, proofs, { adoptSameTx: false });
      if (plan.action === 'skip') {
        leave(movement, plan.reason);
        continue;
      }
      if (plan.action === 'adopt') {
        leave(movement, 'missing-transaction');
        continue;
      }
      const state = await io.apply(movement.reference, plan);
      if (state === 'completed') fixed.push(movement.reference);
      else leave(movement, 'not-completed');
    } catch {
      leave(movement, 'error');
    }
  }

  let bridgesFinished = 0;
  for (const bridgeId of await io.bridgesBehind()) {
    await io.finishBridge(bridgeId);
    bridgesFinished += 1;
  }

  return { at: opts.now, looked: stuck.length, young: open.length - stuck.length, fixed, left, bridgesFinished };
}
