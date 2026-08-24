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
///   --cancel-dead        cancel intents that provably never started: a
///                        backend-signed route with no bridge projection and no
///                        leg ever submitted, so nothing could have been signed.
///                        Never touches a route the browser signs first (see
///                        isDeadIntent), where an empty record says nothing
///                        about the money.
///   --attach-tx 0x...    with --reference: record a transaction the record
///                        never learned, after checking on chain that it
///                        succeeded. For a send that landed while the call
///                        carrying its hash never arrived.
///   --map-mints 0x,0x    read which source chain each Arc mint came from, so a
///                        burn is paired with its own mint instead of a guess.
///                        Five mints to one recipient for near-identical amounts
///                        cannot be told apart by eye; the CCTP header in the
///                        receiveMessage calldata says it outright.
///   --rebuild-projection with --reference: write back the bridge row the route
///                        never got to, so the boot-time resume can finish the
///                        relay. For an inbound bridge whose burn is recorded
///                        and whose mint never landed.
///   --leg <key>          which leg the hash belongs to (burn, mint, activate).
///                        Required when more than one leg is missing its
///                        transaction: a cross-chain bridge's burn is on the
///                        source chain and its mint is on Arc, so one hash is
///                        never both. Only a same-chain send may take --leg all,
///                        where the single transaction genuinely is both.

import { inArray } from 'drizzle-orm';
import { db, ensureSchema, pgEnabled } from '../db/client.js';
import { moneyMovements } from '../db/schema.js';
import { getMoneyMovement, updateMoneyMovement } from '../db/moneyMovements.js';
import { createBridge, getBridge, listAllBridges, patchBridge } from '../db/bridges.js';
import type { BridgeRelay } from '../db/bridges.js';
import { recordCashoutLeg } from '../money/cashout.js';
import { completeMoneyMovement } from '../money/service.js';
import {
  canTransitionMovement,
  formatUsdcMicros,
  transitionMoneyMovement,
  type MoneyMovement,
  type MoneyMovementLeg,
} from '../money/model.js';
import {
  activeLegs,
  completionPath,
  isDeadIntent,
  planReconcile,
  type LegProof,
  type ReconcilePlan,
} from '../money/reconcile.js';
import { decodeFunctionData, hexToNumber, slice } from 'viem';
import { publicClient } from '../chain/client.js';
import { CCTP_CHAINS } from '../chain/cctpChains.js';
import { sourceClients } from '../chain/cctpClients.js';
import { CCTP_CHAIN_KEYS } from '../chain/cctpChains.js';

const execute = process.argv.includes('--execute');
const cancelDead = process.argv.includes('--cancel-dead');
const adoptSameTx = process.argv.includes('--adopt-same-tx');

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const olderThanMins = Number(flag('--older-than-mins') ?? 60);
const onlyReference = flag('--reference')?.toUpperCase();
const attachTx = flag('--attach-tx')?.trim().toLowerCase();
const attachLeg = flag('--leg')?.trim();
const rebuildProjection = process.argv.includes('--rebuild-projection');
const mapMints = flag('--map-mints')?.trim();

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
    const current = await getMoneyMovement(reference);
    if (!current) return 'unreadable';
    // `completed` is only reachable from `verifying`, so a movement parked in
    // needs_attention has to walk back through preparing first. Each hop goes
    // through the state machine rather than around it, and the final one is left
    // to completeMoneyMovement so its own "no unverified legs" guard still runs.
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

  if (attachTx) {
    await attachTransaction(attachTx);
    return;
  }

  if (mapMints) {
    await reportMintSources(mapMints.split(',').map((h) => h.trim()).filter(Boolean));
    return;
  }

  if (rebuildProjection) {
    await rebuildBridgeProjection();
    return;
  }

  // Every bridge, under both keys it can be found by. A stuck bridge movement is
  // only half the story: the projection carries which chains were involved, how
  // far the pipeline got, and the error it stopped on, and reading them side by
  // side is what tells a dead intent apart from a transfer that left.
  //
  // `movementReference` alone is not enough. It is documented as optional for
  // rows written before the movement spine, which is exactly the vintage most
  // likely to be stuck, so keying only on it silently found nothing and the
  // report printed no bridge line at all. Every bridge movement's operationKey
  // ends with its bridgeId (`bridge:record:0x…:<id>`), so that is the second key.
  const bridgeByReference = new Map<string, BridgeRelay>();
  const bridgeById = new Map<string, BridgeRelay>();
  for (const bridge of await listAllBridges()) {
    if (bridge.movementReference) bridgeByReference.set(bridge.movementReference, bridge);
    bridgeById.set(bridge.bridgeId, bridge);
  }

  function bridgeFor(movement: MoneyMovement): BridgeRelay | undefined {
    const byRef = bridgeByReference.get(movement.reference);
    if (byRef) return byRef;
    const tail = movement.operationKey.split(':').pop();
    return tail ? bridgeById.get(tail) : undefined;
  }

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
  let failed = 0;
  let dead = 0;
  let cancelled = 0;
  const skips = new Map<string, number>();

  for (const movement of stuck) {
    try {
      await review(movement);
    } catch (err) {
      // A movement that throws is reported and stepped over. The first version
      // let one invalid transition abort the whole sweep, so the rows after it
      // were never even looked at.
      failed += 1;
      console.log(`  ERROR: ${(err as Error).message}`);
      console.log('');
    }
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
  if (dead > 0) {
    console.log(
      cancelDead
        ? `  ${cancelled} of ${dead} dead intent(s) cancelled`
        : `  ${dead} dead intent(s), never started. --cancel-dead closes them.`,
    );
  }
  if (failed > 0) console.log(`  ${failed} errored, listed above`);
  if (!execute && actionable > 0) console.log('Re-run with --execute to apply.');

  async function review(movement: MoneyMovement): Promise<void> {
    const active = activeLegs(movement);
    const age = Math.round((Date.now() - movement.updatedAt) / 3_600_000);
    console.log(
      `${movement.reference}  ${movement.kind}  ${movement.state}  ` +
        `${formatUsdcMicros(movement.amountMicros)} USDC  ${age}h since last change`,
    );
    console.log(`  ${movement.summary}`);

    const bridge = bridgeFor(movement);
    // Say so out loud. A movement with no projection means the row was never
    // written, which is itself the answer: nothing downstream of it ever ran.
    if (!bridge && movement.kind === 'bridge') {
      console.log('  no bridge projection for this movement');
    }
    if (bridge) {
      const route = [bridge.sourceChainKey ?? '?', bridge.destChainKey ?? 'arc'].join(' -> ');
      console.log(
        `  bridge ${bridge.bridgeId}: ${bridge.status}, ${route}` +
          `${bridge.direction ? `, direction ${bridge.direction}` : ''}` +
          `${bridge.appKit ? ', app-kit' : ''}` +
          `${bridge.sourceTxHash ? `, source ${bridge.sourceTxHash.slice(0, 10)}…` : ', no source tx'}`,
      );
      if (bridge.error) console.log(`  bridge error: ${bridge.error}`);
    }

    const proofs = new Map<string, LegProof>();
    for (const leg of active) {
      const proof = await proofFor(leg);
      proofs.set(leg.id, proof);
      const shown = leg.txHash ? `${leg.txHash.slice(0, 10)}…` : 'no tx';
      const where = 'chain' in proof ? ` on ${proof.chain}` : '';
      console.log(`  leg ${leg.key} (${leg.label}): ${leg.state}, ${shown} -> ${proof.kind}${where}`);
    }

    const plan = planReconcile(movement, proofs, { adoptSameTx });
    // An intent that provably never started. Checked before the skip below,
    // because its skip reason is `missing-transaction`, which is exactly right
    // and exactly unhelpful: the transaction is missing because there never was
    // one.
    if (plan.action === 'skip' && isDeadIntent({ movement, hasBridgeProjection: !!bridge })) {
      dead += 1;
      if (!cancelDead) {
        console.log('  DEAD: never started, nothing was signed. --cancel-dead closes it.');
        console.log('');
        return;
      }
      if (!execute) {
        console.log('  would cancel: never started, nothing was signed');
        console.log('');
        return;
      }
      await updateMoneyMovement(movement.reference, (current) =>
        canTransitionMovement(current.state, 'cancelled')
          ? transitionMoneyMovement(current, 'cancelled', { nextActor: 'none' })
          : current,
      );
      const after = await getMoneyMovement(movement.reference);
      cancelled += 1;
      console.log(`  cancelled -> ${after?.state ?? 'unreadable'}`);
      console.log('');
      return;
    }
    if (plan.action === 'skip') {
      skips.set(plan.reason, (skips.get(plan.reason) ?? 0) + 1);
      console.log(`  SKIP: ${SKIP_NOTES[plan.reason] ?? plan.reason}`);
      console.log('');
      return;
    }

    actionable += 1;
    if (plan.action === 'adopt') {
      console.log(`  same-chain send: adopting ${plan.from.slice(0, 10)}… for its hashless leg`);
    }
    if (!execute) {
      console.log(`  would ${plan.action}`);
      console.log('');
      return;
    }
    // Report the state it actually reached. Claiming a repair because the calls
    // were made, without checking, is how a reconcile script becomes the thing
    // that needs reconciling.
    const state = await apply(movement.reference, plan);
    if (state === 'completed') fixed += 1;
    console.log(state === 'completed' ? '  repaired -> completed' : `  still ${state} afterwards`);
    console.log('');
  }
}

/// Which source chain did each Arc mint come from?
///
/// Five mints landed on Arc, to the same recipient, for amounts differing only
/// by each chain's CCTP fee. Nothing about them tells you which burn each one
/// settles, and pairing them by eye would put one chain's burn next to another
/// chain's mint in a record people trace. So it is read rather than guessed: an
/// Arc mint is `receiveMessage(message, attestation)`, and the message's header
/// carries the source domain at a fixed offset, whatever the CCTP version:
///
///   version (4 bytes) | sourceDomain (4) | destinationDomain (4) | nonce ...
const RECEIVE_MESSAGE_ABI = [
  {
    type: 'function',
    name: 'receiveMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'message', type: 'bytes' },
      { name: 'attestation', type: 'bytes' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

async function reportMintSources(hashes: string[]): Promise<void> {
  if (hashes.length === 0) {
    console.log('--map-mints takes a comma-separated list of Arc transaction hashes');
    process.exitCode = 1;
    return;
  }
  for (const hash of hashes) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
      console.log(`${hash}  not a transaction hash`);
      continue;
    }
    try {
      const tx = await publicClient.getTransaction({ hash: hash as `0x${string}` });
      const decoded = decodeFunctionData({ abi: RECEIVE_MESSAGE_ABI, data: tx.input });
      const message = decoded.args[0] as `0x${string}`;
      const sourceDomain = hexToNumber(slice(message, 4, 8));
      const key = CCTP_CHAIN_KEYS.find((k) => CCTP_CHAINS[k].domain === sourceDomain);
      console.log(
        `${hash}  <- domain ${sourceDomain}  ${key ? CCTP_CHAINS[key].name : 'unknown chain'}`,
      );
    } catch (err) {
      // A hash that is not a receiveMessage, or an RPC that cannot answer. Say
      // which rather than failing the whole batch.
      console.log(`${hash}  could not read: ${(err as Error).message.split('\n')[0]}`);
    }
  }
}

/// Write back the bridge row the route never got to.
///
/// `/record` plans the legs, records the burn, then creates the bridge row. The
/// version guard threw in the middle, so five inbound bridges have a burn that
/// happened on chain and no row anywhere: nothing in the UI can see them, and
/// `resumePendingBridges` cannot pick them up, because it iterates bridge rows.
///
/// So this reconstructs the row from the movement, which holds everything it
/// needs: the bridgeId is the tail of the operationKey, the recipient is on the
/// mint leg, the amount is the movement's, and the source chain is named in the
/// summary. Written as `relaying` with the burn hash, which is exactly the shape
/// resume looks for, so the NEXT CONTAINER RESTART fetches the attestation and
/// mints, or finds the message already received and marks it minted. No new
/// relay logic: the path that would have run is the path that runs.
async function rebuildBridgeProjection(): Promise<void> {
  if (!onlyReference) {
    console.log('--rebuild-projection needs --reference KWN-...');
    process.exitCode = 1;
    return;
  }
  const movement = await getMoneyMovement(onlyReference);
  if (!movement) {
    console.log(`no movement with reference ${onlyReference}`);
    process.exitCode = 1;
    return;
  }
  const legs = activeLegs(movement);
  const burn = legs.find((leg) => leg.key === 'burn');
  const mint = legs.find((leg) => leg.key === 'mint');
  if (!burn?.txHash) {
    console.log('  the burn leg has no transaction yet. Attach it first with --attach-tx --leg burn');
    process.exitCode = 1;
    return;
  }
  const alreadyMinted = !!mint?.txHash;
  const bridgeId = movement.operationKey.split(':').pop();
  if (!bridgeId) {
    console.log('  cannot recover a bridgeId from the operation key');
    process.exitCode = 1;
    return;
  }
  if (await getBridge(bridgeId)) {
    console.log(`  bridge ${bridgeId} already exists; resume will pick it up`);
    return;
  }
  // The source chain is only in the summary, because an inbound burn leg stores
  // no addresses. chainLabel() wrote the display name, so it is matched back.
  const sourceKey = CCTP_CHAIN_KEYS.find((key) =>
    movement.summary.includes(CCTP_CHAINS[key].name),
  );
  if (!sourceKey) {
    console.log(`  cannot tell which chain "${movement.summary}" burned on`);
    process.exitCode = 1;
    return;
  }
  const recipient =
    mint?.destinationAddress ??
    movement.participants.find((party) => party.role === 'recipient')?.address;
  if (!recipient) {
    console.log('  cannot recover the mint recipient from the movement');
    process.exitCode = 1;
    return;
  }
  const amountUsdc = formatUsdcMicros(movement.amountMicros);
  console.log(`${movement.reference}  ${movement.kind}  ${movement.state}`);
  console.log(`  ${movement.summary}`);
  console.log(
    `  bridge ${bridgeId}: ${sourceKey} (domain ${CCTP_CHAINS[sourceKey].domain}) -> arc, ` +
      `${amountUsdc} USDC to ${recipient}`,
  );
  console.log(
    `  burn ${burn.txHash.slice(0, 10)}…` +
      (mint?.txHash ? `, mint ${mint.txHash.slice(0, 10)}… (already landed)` : ', mint pending'),
  );
  if (!execute) {
    console.log('  would write the bridge row as relaying; re-run with --execute');
    console.log('  then RESTART the api container so resumePendingBridges finishes the relay');
    return;
  }
  await createBridge({
    bridgeId,
    movementReference: movement.reference,
    sourceDomain: CCTP_CHAINS[sourceKey].domain,
    sourceTxHash: burn.txHash,
    amountUsdc,
    mintRecipient: recipient,
    status: alreadyMinted ? 'minted' : 'relaying',
    ...(mint?.txHash ? { mintTxHash: mint.txHash } : {}),
    sourceChainKey: sourceKey,
    direction: 'in',
  });
  if (alreadyMinted) {
    // The mint is on chain and its hash is on the leg, so there is nothing to
    // relay: the row is written settled and bridge history is whole without a
    // restart.
    console.log('  written as minted; the transfer already landed on Arc');
  } else {
    console.log('  written as relaying');
    console.log('  RESTART the api container: resumePendingBridges will fetch the attestation');
    console.log('  and mint on Arc, or find the message already received and mark it minted.');
  }
}

/// Give a movement the transaction its record never learned.
///
/// The case: a send the browser signed, which landed, while the call carrying
/// its hash never arrived. Only the chain knows the hash, so an operator brings
/// it, and this refuses to write it unless the chain agrees it succeeded. It
/// will not invent, guess, or search: one named movement, one named hash.
async function attachTransaction(hash: string): Promise<void> {
  if (!onlyReference) {
    console.log('--attach-tx needs --reference KWN-... so the hash lands on one named movement');
    process.exitCode = 1;
    return;
  }
  if (!/^0x[0-9a-f]{64}$/.test(hash)) {
    console.log(`not a transaction hash: ${hash}`);
    process.exitCode = 1;
    return;
  }
  const movement = await getMoneyMovement(onlyReference);
  if (!movement) {
    console.log(`no movement with reference ${onlyReference}`);
    process.exitCode = 1;
    return;
  }
  const proof = await proofFor({ txHash: hash } as MoneyMovementLeg);
  console.log(`${onlyReference}  ${movement.kind}  ${movement.state}`);
  console.log(`  ${movement.summary}`);
  console.log(`  ${hash} -> ${proof.kind}${'chain' in proof ? ` on ${proof.chain}` : ''}`);
  if (proof.kind !== 'landed') {
    console.log('  refusing: only a transaction the chain confirms as successful can be attached');
    process.exitCode = 1;
    return;
  }
  const hashless = activeLegs(movement).filter((leg) => !leg.txHash && leg.state === 'planned');
  if (hashless.length === 0) {
    console.log('  nothing to attach: every leg already holds a transaction');
    return;
  }

  // One hash is not two legs. A cross-chain bridge burns on the source chain and
  // mints on Arc, so stamping the burn's hash onto the mint would put a
  // transaction against a movement of money that has not happened. Only a
  // same-chain send may claim both, and the operator has to say so.
  let targets = hashless;
  if (attachLeg && attachLeg !== 'all') {
    targets = hashless.filter((leg) => leg.key === attachLeg);
    if (targets.length === 0) {
      console.log(
        `  no leg named ${attachLeg} is missing a transaction. ` +
          `Missing: ${hashless.map((l) => l.key).join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }
  } else if (hashless.length > 1 && attachLeg !== 'all') {
    console.log(
      `  ${hashless.length} legs are missing a transaction: ${hashless.map((l) => l.key).join(', ')}`,
    );
    console.log('  name one with --leg <key>, or --leg all if this really is one transaction');
    process.exitCode = 1;
    return;
  }
  console.log(`  would attach to ${targets.length} leg(s): ${targets.map((l) => l.key).join(', ')}`);
  if (!execute) {
    console.log('  re-run with --execute to apply');
    return;
  }
  for (const leg of targets) {
    await recordCashoutLeg(movement.reference, leg.key, { txHash: hash });
  }
  const after = await getMoneyMovement(movement.reference);
  console.log(`  ${after?.state ?? 'unreadable'}`);
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
