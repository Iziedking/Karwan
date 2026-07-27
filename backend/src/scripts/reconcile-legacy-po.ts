import { publicClient } from '../chain/client.js';
import { legacyPoFinancingAbi, LEGACY_STATE_TO_DB } from '../chain/abis/legacyPoFinancing.js';
import { listAllLines, patchPOLine, type POFinancingState } from '../db/poFinancing.js';

/// Resync PO lines left on the retired custody contract with what the chain
/// actually says.
///
/// The cutover on 2026-07-27 moved PO financing to a new contract. Lines opened
/// before it stayed on the old one, and anything that then happened to them
/// happened OUTSIDE the watcher: the recovery for the stranded-principal
/// incident was run by hand with cast, so the chain moved and the mirror did
/// not. The result is rows reading "funded, awaiting delivery" for money that
/// settled weeks ago.
///
/// Dismissing those hides the symptom. This fixes the record.
///
/// Read-only by default. Pass --apply to write.
///
///   npx tsx src/scripts/reconcile-legacy-po.ts
///   npx tsx src/scripts/reconcile-legacy-po.ts --apply
///
/// The legacy address is fixed rather than read from config, because config
/// points at the LIVE contract and reconciling against that would compare every
/// legacy row to a contract that has never heard of it.

const LEGACY_ADDRESS = (process.env.KARWAN_PO_FINANCING_LEGACY_ADDR ??
  '0xf14b41BD1a07c9Fe643Aae8292422127d0221d6F') as `0x${string}`;

/// Only these are on the retired contract. A row in a current-rail state is
/// none of this script's business, and reading it against the old contract
/// would return an empty line and look like a drift that is not there.
const LEGACY_DB_STATES = new Set<POFinancingState>(['funded', 'released', 'reclaimed']);

const apply = process.argv.includes('--apply');

interface Drift {
  lineId: string;
  invoiceId: string;
  dbState: string;
  chainState: string;
  onChainCode: number;
}

async function main(): Promise<void> {
  const all = await listAllLines();
  const legacy = all.filter((l) => LEGACY_DB_STATES.has(l.state));

  console.log(`legacy contract : ${LEGACY_ADDRESS}`);
  console.log(`lines in store  : ${all.length}`);
  console.log(`on the old rail : ${legacy.length}`);
  console.log(apply ? 'mode            : APPLY\n' : 'mode            : dry run (pass --apply to write)\n');

  if (legacy.length === 0) {
    console.log('nothing to reconcile');
    return;
  }

  const drifts: Drift[] = [];
  const unreadable: string[] = [];

  for (const line of legacy) {
    let onChainCode: number;
    try {
      const result = (await publicClient.readContract({
        address: LEGACY_ADDRESS,
        abi: legacyPoFinancingAbi,
        functionName: 'getLine',
        args: [line.invoiceId as `0x${string}`],
      })) as { state: number };
      onChainCode = Number(result.state);
    } catch (err) {
      // Never guess. An unreadable line stays exactly as it is.
      unreadable.push(`${line.id} (${(err as Error).message.slice(0, 60)})`);
      continue;
    }

    const chainState = LEGACY_STATE_TO_DB[onChainCode] ?? `unknown(${onChainCode})`;

    // State 0 means the old contract has no record of this invoice. That is not
    // drift, it is a row that was never funded there, and rewriting it from a
    // zero read would destroy real information.
    if (onChainCode === 0) {
      console.log(`  ${line.id}  db=${line.state}  chain=NONE  skipped, no line on the old contract`);
      continue;
    }

    if (chainState === line.state) {
      console.log(`  ${line.id}  db=${line.state}  chain=${chainState}  ok`);
      continue;
    }

    drifts.push({
      lineId: line.id,
      invoiceId: line.invoiceId,
      dbState: line.state,
      chainState,
      onChainCode,
    });
    console.log(`  ${line.id}  db=${line.state}  chain=${chainState}  DRIFT`);
  }

  console.log('');
  if (unreadable.length > 0) {
    console.log(`unreadable, left untouched (${unreadable.length}):`);
    for (const u of unreadable) console.log(`  ${u}`);
    console.log('');
  }

  if (drifts.length === 0) {
    console.log('no drift found');
    return;
  }

  console.log(`drifted (${drifts.length}):`);
  for (const d of drifts) {
    console.log(`  ${d.lineId}  ${d.dbState} -> ${d.chainState}`);
  }

  if (!apply) {
    console.log('\ndry run, nothing written. Re-run with --apply to fix the record.');
    return;
  }

  let written = 0;
  for (const d of drifts) {
    const patch: Record<string, unknown> = { state: d.chainState as POFinancingState };
    // Stamp the timestamp the new state implies, so the row reads coherently
    // rather than claiming a state with no moment attached.
    if (d.chainState === 'repaid') patch.repaidAt = Date.now();
    if (d.chainState === 'released') patch.releasedAt = Date.now();
    await patchPOLine(d.lineId, patch);
    written++;
    console.log(`  wrote ${d.lineId} -> ${d.chainState}`);
  }
  console.log(`\nreconciled ${written} line(s) against the chain`);
}

main().catch((err) => {
  console.error('reconcile failed:', (err as Error).message);
  process.exit(1);
});
