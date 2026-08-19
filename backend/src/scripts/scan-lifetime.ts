/// Seed (or advance) the all-time on-chain totals.
///
///   npm run scan:lifetime            in backend/
///
/// The first run sweeps every block from the earliest Karwan deploy to head
/// across every contract generation, which is roughly 87 million blocks and
/// takes a few minutes. Every run after that starts from the stored cursor and
/// only covers new blocks, so it finishes in seconds.
///
/// This is a script rather than something the API does lazily on the first
/// request because a four-minute request is not a request, it is an outage.
/// The route serves the snapshot this produces and returns 503 until one
/// exists.
///
/// Run it after any contract deploy, and after regenerating the ledger with
/// `node scripts/gen-deploy-ledger.mjs`.

import { rebuildLifetimeStats } from '../chain/lifetimeStats.js';
import { DEPLOY_LEDGER } from '../chain/deployLedger.js';

const started = Date.now();

console.log(`scanning ${DEPLOY_LEDGER.length} contracts from the deploy ledger`);

const stats = await rebuildLifetimeStats((msg) => console.log(`  ${msg}`));

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\ndone in ${secs}s, blocks ${stats.fromBlock} to ${stats.toBlock}\n`);

console.log(`contracts            ${stats.totals.contracts} (${stats.totals.contractsWithActivity} with activity)`);
console.log(`transactions         ${stats.totals.transactions.toLocaleString('en-US')}`);
console.log(`events               ${stats.totals.events.toLocaleString('en-US')}`);
console.log(`deals funded         ${stats.totals.deals.toLocaleString('en-US')}`);
console.log(`jobs posted          ${stats.totals.jobsPosted.toLocaleString('en-US')}`);
console.log(`financings           ${stats.totals.financings.toLocaleString('en-US')} (${stats.totals.defaults} defaulted)`);
console.log('');
console.log(`volume funded        ${stats.volumes.fundedUsdc} USDC`);
console.log(`volume released      ${stats.volumes.releasedUsdc} USDC`);
console.log(`volume settled       ${stats.volumes.settledUsdc} USDC`);
console.log(`volume refunded      ${stats.volumes.refundedUsdc} USDC`);
console.log(`fees collected       ${stats.volumes.feesUsdc} USDC`);
console.log(`capital advanced     ${stats.volumes.advancedUsdc} USDC`);
console.log(`advances repaid      ${stats.volumes.repaidUsdc} USDC`);
console.log(`stake locked         ${stats.volumes.stakedUsdc} USDC`);
console.log(`stake slashed        ${stats.volumes.slashedUsdc} USDC`);
console.log(`yield claimed        ${stats.volumes.yieldUsdc} USDC`);

console.log('\nby kind:');
for (const k of stats.byKind) {
  console.log(
    `  ${k.kind.padEnd(11)} ${String(k.contracts).padStart(2)} contracts` +
      ` (${k.contractsWithActivity} used)  events=${String(k.events).padStart(5)}` +
      `  funded=${k.volumes.fundedUsdc}  advanced=${k.volumes.advancedUsdc}`,
  );
}

if (stats.totals.undecodedEvents > 0) {
  // Loud on purpose. Undecoded events are emitted by a generation whose ABI is
  // no longer in the repo, so their value is missing from the volume totals
  // above. The count is the size of the blind spot.
  console.log(
    `\nWARNING ${stats.totals.undecodedEvents} events could not be decoded and are excluded from volume.`,
  );
  console.log('Add the missing generation ABI to DECODE_ABI in lifetimeStats.ts and rescan.');
}

console.log('\nper contract:');
for (const c of stats.contracts) {
  const flag = c.events === 0 ? ' (never used)' : '';
  // Whichever measure this kind of contract actually moves. Printing `funded`
  // for a financing contract prints zero, and a zero reads as an unused rail
  // rather than as the wrong column.
  const money =
    c.kind === 'financing'
      ? `advanced=${c.advancedUsdc}`
      : c.kind === 'staking'
        ? `staked=${c.stakedUsdc}`
        : c.kind === 'treasury'
          ? `yield=${c.yieldUsdc}`
          : `funded=${c.fundedUsdc}`;
  console.log(
    `  ${c.name.replace('Karwan', '').padEnd(18)} ${c.address}` +
      `  events=${String(c.events).padStart(5)}  ${money}${flag}`,
  );
}

process.exit(0);
