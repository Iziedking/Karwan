/// Money movements that never finished, and what the chain says about them.
///
/// A movement completes when every leg of its current attempt reaches
/// `verified`. Until then transaction history shows it as IN FLIGHT, which is
/// the right answer while a transfer is in the air and the wrong one forever.
/// Two ways a movement gets stuck there:
///
///   1. A leg holds a transaction hash that landed on chain, but the record was
///      never walked forward. The client that submitted it lost the callback: a
///      confirmation wait that timed out, a page closed, a 500 on the recording
///      call. The money moved and the receipt does not say so.
///   2. A leg was planned that no transaction can ever satisfy. An Arc to Arc
///      send is ONE transaction, and the record used to plan a burn leg and a
///      mint leg for it, so the second leg had nothing to point at. Today
///      routes/bridge.ts plans only the burn for a same-chain send; rows written
///      before that stayed behind.
///
/// This script does the reading. Every decision about what a reading means lives
/// in money/reconcile.ts and is unit tested, because the failure mode of a
/// reconcile script is not missing a row, it is completing a movement whose
/// money never moved.
///
/// It writes NOTHING without `--execute`, and even then only walks a leg forward
/// when a receipt proves the transaction succeeded. It never invents a hash,
/// never marks anything failed, and never touches a movement younger than the
/// age cut, because a transfer in flight is not a transfer stuck.
///
/// Run, inside the api container:
///   node dist/scripts/reconcile-stuck-movements.js                  (report)
///   node dist/scripts/reconcile-stuck-movements.js --execute        (repair)
///
/// Locally: npm run money:reconcile
///
/// Flags:
///   --older-than-mins N  ignore movements updated within N minutes (default 60)
///   --reference KWN-...  one movement only, whatever its age
///   --adopt-same-tx      case 2: verify a hashless leg using its sibling's
///                        transaction, for a same-chain send where the two legs
///                        genuinely ARE one transaction. Off by default because
///                        it is the one judgement involved.

import { inArray } from 'drizzle-orm';
import { db, ensureSchema, pgEnabled } from '../db/client.js';
import { moneyMovements } from '../db/schema.js';
import { getMoneyMovement } from '../db/moneyMovements.js';
import { listAllBridges, patchBridge } from '../db/bridges.js';
import { recordCashoutLeg } from '../money/cashout.js';
import { completeMoneyMovement } from '../money/service.js';
import { formatUsdcMicros, type MoneyMovement, type MoneyMovementLeg } from '../money/model.js';
import {
  activeLegs,
  planReconcile,
  type LegProof,
  type ReconcilePlan,
} from '../money/reconcile.js';
import { publicClient } from '../chain/client.js';
import { sourceClients } from '../chain/cctpClients.js';
import { CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';

const execute = process.argv.includes('--execute');
const adoptSameTx = process.argv.includes('--adopt-same-tx');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const olderThanMins = Number(flag('--older-than-mins') ?? 60);
const onlyReference = flag('--reference')?.toUpperCase();

/// States a movement can sit in forever. `needs_attention` is included on
/// purpose: it is where a failed leg parks, and a movement whose transaction
/// actually succeeded belongs out of it.
const OPEN_STATES = ['created', 'preparing', 'submitted', 'verifying', 'needs_attention'];

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

async function proofFor(leg: MoneyMovementLeg): Promise<LegProof> {
  if (!leg.txHash) return { kind: 'no-hash' };
  const hash = leg.txHash as `0x${string}`;
  for (const chain of CHAINS) {
    try {
      const receipt = await chain.client.getTransactionReceipt({ hash });
      return receipt.status === 'success'
        ? { kind: 'landed', chain: chain.name }
        : { kind: 'reverted', chain: chain.name };
    } catch {
      // Not on this chain, or this RPC cannot answer. Ask the next one. A hash
      // no chain knows comes back as unknown rather than as a failure: an RPC
      // that cannot see a transaction has not proved it does not exist.
    }
  }
  return { kind: 'unknown' };
}

async function loadMovements(): Promise<MoneyMovement[]> {
  if (onlyReference) {
    const one = await getMoneyMovement(onlyReference);
    if (!one) throw new Error(`no movement with reference ${onlyReference}`);
    return [one];
  }
  if (!pgEnabled) throw new Error('this script needs Postgres; set DATABASE_URL');
  const rows = await db()
    .select({ data: moneyMovements.data })
    .from(moneyMovements)
    .where(inArray(moneyMovements.state, OPEN_STATES));
  return rows.map((r) => r.data);
}

const SKIP_NOTES: Record<string, string> = {
  reverted: 'reverted on chain. A failed transfer is not a record to complete.',
  unconfirmable: 'no chain could confirm one of these hashes.',
  'failed-leg-landed':
    'a leg is marked failed while its transaction succeeded. A failed leg is terminal, so this needs a new attempt rather than a repair.',
  'missing-transaction': adoptSameTx
    ? 'a leg has no transaction, and these legs are not one transaction.'
    : 'a leg has no transaction. Re-run with --adopt-same-tx if this is a same-chain send.',
  terminal: 'already finished.',
  'nothing-to-do': 'no legs on the current attempt.',
};

async function apply(reference: string, plan: ReconcilePlan): Promise<string> {
  if (plan.action === 'complete') {
    const after = await completeMoneyMovement(reference);
    return after.state;
  }
  if (plan.action === 'repair' || plan.action === 'adopt') {
    // Walk each leg through the normal recording path so it climbs planned ->
    // submitted -> confirmed -> verified and the movement completes the way a
    // live one would, rather than having its state written by hand here.
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

async function main() {
  if (pgEnabled) await ensureSchema();

  const cutoff = Date.now() - olderThanMins * 60_000;
  const all = await loadMovements();
  const stuck = all.filter((m) => onlyReference !== undefined || m.updatedAt <= cutoff);
  const skippedYoung = all.length - stuck.length;

  console.log(
    `${all.length} open movement(s); ${stuck.length} older than ${olderThanMins}m` +
      (skippedYoung ? `, ${skippedYoung} still recent and left alone` : ''),
  );
  console.log(execute ? 'MODE: repair' : 'MODE: report only, nothing will be written');
  console.log('');

  let fixed = 0;
  let actionable = 0;
  const skips = new Map<string, number>();

  for (const movement of stuck) {
    const active = activeLegs(movement);
    const age = Math.round((Date.now() - movement.updatedAt) / 3_600_000);
    console.log(
      `${movement.reference}  ${movement.kind}  ${movement.state}  ` +
        `${formatUsdcMicros(movement.amountMicros)} USDC  ${age}h since last change`,
    );
    console.log(`  ${movement.summary}`);

    const proofs = new Map<string, LegProof>();
    for (const leg of active) {
      const proof = await proofFor(leg);
      proofs.set(leg.id, proof);
      const shown = leg.txHash ? `${leg.txHash.slice(0, 10)}…` : 'no tx';
      const where = 'chain' in proof ? ` on ${proof.chain}` : '';
      console.log(`  leg ${leg.key} (${leg.label}): ${leg.state}, ${shown} -> ${proof.kind}${where}`);
    }

    const plan = planReconcile(movement, proofs, { adoptSameTx });
    if (plan.action === 'skip') {
      skips.set(plan.reason, (skips.get(plan.reason) ?? 0) + 1);
      console.log(`  SKIP: ${SKIP_NOTES[plan.reason] ?? plan.reason}`);
      console.log('');
      continue;
    }

    actionable += 1;
    if (plan.action === 'adopt') {
      console.log(`  same-chain send: adopting ${plan.from.slice(0, 10)}… for its hashless leg`);
    }
    if (!execute) {
      console.log(`  would ${plan.action}`);
      console.log('');
      continue;
    }
    // Report the state it actually reached. Claiming a repair because the calls
    // were made, without checking, is how a reconcile script becomes the thing
    // that needs reconciling.
    const state = await apply(movement.reference, plan);
    if (state === 'completed') fixed += 1;
    console.log(state === 'completed' ? '  repaired -> completed' : `  still ${state} afterwards`);
    console.log('');
  }

  await sweepBridgeProjections();

  console.log('---');
  console.log(
    execute
      ? `${fixed} of ${actionable} actionable movement(s) reached completed`
      : `${actionable} movement(s) actionable`,
  );
  for (const [reason, count] of [...skips].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count} skipped: ${reason}`);
  }
  if (!execute && actionable > 0) console.log('Re-run with --execute to apply.');
}

/// The bridge row is a projection of the movement, and it can lag behind it: the
/// recording route patches the projection AFTER the legs, so anything that threw
/// in between left a completed movement behind a bridge still reading as
/// relaying. Bridge history shows the projection, so the transfer looks in
/// flight while its receipt says settled.
async function sweepBridgeProjections() {
  const bridges = await listAllBridges();
  const behind: Array<{ bridgeId: string; reference: string }> = [];
  for (const bridge of bridges) {
    if (!bridge.movementReference) continue;
    if (bridge.status === 'minted') continue;
    const movement = await getMoneyMovement(bridge.movementReference);
    if (movement?.state === 'completed') {
      behind.push({ bridgeId: bridge.bridgeId, reference: bridge.movementReference });
    }
  }
  if (behind.length === 0) {
    console.log('bridge projections: all in step with their movements');
    return;
  }
  console.log(`bridge projections: ${behind.length} behind a completed movement`);
  for (const row of behind) {
    console.log(`  ${row.bridgeId} (${row.reference})${execute ? ' -> minted' : ''}`);
    if (execute) await patchBridge(row.bridgeId, { status: 'minted' });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
