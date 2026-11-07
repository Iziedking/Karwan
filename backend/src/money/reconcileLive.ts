/// The reads and writes behind the stuck-money check, shared by the scheduled
/// sweep (view 67) and scripts/reconcile-stuck-movements.ts.

import { inArray } from 'drizzle-orm';
import { db, pgEnabled } from '../db/client.js';
import { moneyMovements } from '../db/schema.js';
import { getMoneyMovement, updateMoneyMovement } from '../db/moneyMovements.js';
import { listAllBridges, patchBridge } from '../db/bridges.js';
import { recordCashoutLeg } from './cashout.js';
import { completeMoneyMovement } from './service.js';
import { canTransitionMovement, transitionMoneyMovement, type MoneyMovement, type MoneyMovementLeg } from './model.js';
import { completionPath, type LegProof, type ReconcilePlan } from './reconcile.js';
import type { SweepIo } from './reconcileSweep.js';
import { publicClient } from '../chain/client.js';
import { sourceClients } from '../chain/cctpClients.js';
import { CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';

/// States a movement can sit in forever. `needs_attention` is included on
/// purpose: it is where a failed leg parks, and a movement whose transaction
/// actually succeeded belongs out of it.
export const OPEN_STATES = ['created', 'preparing', 'submitted', 'verifying', 'needs_attention'];

interface ReceiptReader {
  getTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: 'success' | 'reverted' }>;
}

/// Every chain a leg could have landed on, Arc first because most of them did.
const CHAINS: Array<{ name: string; client: ReceiptReader }> = [
  { name: 'arc', client: publicClient as unknown as ReceiptReader },
  ...CCTP_CHAIN_KEYS.filter((k) => sourceClients[k]).map((k) => ({
    name: k,
    client: sourceClients[k] as unknown as ReceiptReader,
  })),
];

/// How long one chain gets to answer before the search moves on. A miss is the
/// common case, so it has to be cheap; one slow RPC must not hang the run.
const LOOKUP_TIMEOUT_MS = 8_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`lookup timed out after ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/// What the chains say about one leg's transaction. Asked of every chain at
/// once: a transaction exists on exactly one of them.
export async function legProof(leg: Pick<MoneyMovementLeg, 'txHash'>): Promise<LegProof> {
  if (!leg.txHash) return { kind: 'no-hash' };
  const hash = leg.txHash as `0x${string}`;
  const answers = await Promise.allSettled(
    CHAINS.map(async (chain) => {
      const receipt = await withTimeout(chain.client.getTransactionReceipt({ hash }), LOOKUP_TIMEOUT_MS);
      return { chain: chain.name, status: receipt.status };
    }),
  );
  for (const answer of answers) {
    if (answer.status !== 'fulfilled') continue;
    return answer.value.status === 'success'
      ? { kind: 'landed', chain: answer.value.chain }
      : { kind: 'reverted', chain: answer.value.chain };
  }
  // Nobody had it, or nobody answered in time. Either way this is `unknown`, not
  // a failure: an RPC that cannot see a transaction has not proved it does not
  // exist, and the caller refuses to write on `unknown`.
  return { kind: 'unknown' };
}

/// Applies a repair or completion and returns the state the movement reached.
export async function applyReconcilePlan(reference: string, plan: ReconcilePlan): Promise<string> {
  if (plan.action === 'complete') {
    const current = await getMoneyMovement(reference);
    if (!current) return 'unreadable';
    // `completed` is only reachable from `verifying`, so a movement parked in
    // needs_attention walks back through preparing first. Each hop goes through
    // the state machine, and the last is left to completeMoneyMovement so its
    // own "no unverified legs" guard still runs.
    const path = completionPath(current.state);
    if (path.length === 0) return current.state;
    for (const next of path.slice(0, -1)) {
      await updateMoneyMovement(reference, (movement) =>
        canTransitionMovement(movement.state, next)
          ? transitionMoneyMovement(movement, next, { nextActor: 'karwan' })
          : movement,
      );
    }
    const after = await completeMoneyMovement(reference);
    return after.state;
  }
  if (plan.action === 'repair' || plan.action === 'adopt') {
    // Each leg goes through the normal recording path, so it climbs planned ->
    // submitted -> confirmed -> verified and the movement completes the way a
    // live one would.
    for (const repair of plan.legs) {
      await recordCashoutLeg(reference, repair.key, {
        txHash: repair.txHash,
        ...(repair.explorerUrl ? { explorerUrl: repair.explorerUrl } : {}),
      });
    }
    const after = await getMoneyMovement(reference);
    return after?.state ?? 'unreadable';
  }
  return 'skipped';
}

export async function openMovements(): Promise<MoneyMovement[]> {
  if (!pgEnabled) return [];
  const rows = await db()
    .select({ data: moneyMovements.data })
    .from(moneyMovements)
    .where(inArray(moneyMovements.state, OPEN_STATES));
  return rows.map((r) => r.data);
}

/// Bridge rows still in flight while their movement is completed: the route
/// patches the row after the legs, so anything that threw in between left it
/// behind.
async function bridgesBehind(): Promise<string[]> {
  const behind: string[] = [];
  for (const bridge of await listAllBridges()) {
    if (!bridge.movementReference || bridge.status === 'minted') continue;
    const movement = await getMoneyMovement(bridge.movementReference);
    if (movement?.state === 'completed') behind.push(bridge.bridgeId);
  }
  return behind;
}

export const liveSweepIo: SweepIo = {
  open: openMovements,
  proof: legProof,
  apply: applyReconcilePlan,
  bridgesBehind,
  finishBridge: async (bridgeId) => {
    await patchBridge(bridgeId, { status: 'minted' });
  },
};
