/// Set up the Karwan record of every existing testnet account whose wallets
/// Karwan holds (owner, 26 Oct 2026).
///
/// A record is the identity on the escrow family's registry with both agents
/// bound to it. New deals open on the family, which notes each side's record
/// when the money goes in, and a selling agent offers only once its owner has
/// one. Accounts made before the family went live have none, so their agents
/// sat out of every request. From now on testnet signs the setup at the moment a
/// record is needed (identity/suiteIdentity.ts); this catches up everyone else.
///
///   - email and passkey accounts: Karwan holds the identity wallet and both
///     agents, so register and both bindings are sent here.
///   - connected wallets: the identity is the person's own and only they can
///     sign; they are counted and listed, and set up when they next need it.
///
/// One account at a time, each checked against the chain afterwards. Report
/// only by default; testnet only.
///
///   node dist/scripts/backfill-records.js                       (report)
///   node dist/scripts/backfill-records.js --execute             (sign every one)
///   node dist/scripts/backfill-records.js --execute --limit 3   (try a few first)

import { ARC } from '../chain/client.js';
import { ensureSchema, pgEnabled } from '../db/client.js';
import { listAllAgentWallets } from '../db/agentWallets.js';
import { getUserByAddress, initUsersStore } from '../db/users.js';
import { suiteIdentity } from '../identity/suiteIdentityLive.js';

const execute = process.argv.includes('--execute');
const limitAt = process.argv.indexOf('--limit');
const limit = limitAt > 0 ? Number(process.argv[limitAt + 1]) : Infinity;

/// A pause between accounts, so the reads and the sends do not burst the RPC pool.
const PAUSE_MS = Number(process.env.RECORD_BACKFILL_PAUSE_MS ?? 250);
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

async function main() {
  if (!ARC.testnet) throw new Error('testnet only: on mainnet each person confirms their own record setup');
  if (!suiteIdentity) throw new Error('the escrow family is not configured here (no identity registry)');
  if (!Number.isFinite(limit) && limitAt > 0) throw new Error('--limit needs a number');
  if (pgEnabled) await ensureSchema();
  await initUsersStore();

  const accounts = await listAllAgentWallets();
  console.log(`${accounts.length} account(s) with agents`);
  console.log(execute ? 'MODE: sign the record setup for accounts Karwan holds' : 'MODE: report only, nothing will be sent');
  console.log('');

  let complete = 0;
  let toSign = 0;
  let signed = 0;
  let failed = 0;
  let unreadable = 0;
  const ownWallet: string[] = [];
  const failures: string[] = [];
  let attempted = 0;

  for (const account of accounts) {
    const user = account.userAddress.toLowerCase();
    await pause();
    let status;
    try {
      status = await suiteIdentity.identityStatus(user);
    } catch (err) {
      unreadable += 1;
      failures.push(`${user} unreadable: ${(err as Error).message.split('\n')[0]}`);
      continue;
    }
    const nowSecs = BigInt(Math.floor(Date.now() / 1000));
    if (status.identityId !== 0n && status.sellerBound && status.buyerBound && status.buyerExpiresAt > nowSecs) {
      complete += 1;
      continue;
    }
    if (!getUserByAddress(user)?.circleIdentityWalletId) {
      ownWallet.push(user);
      continue;
    }
    toSign += 1;
    if (!execute || attempted >= limit) continue;
    attempted += 1;
    try {
      await suiteIdentity.setUpIdentityForCustodial(user);
      // Confirmed from the chain, not from the calls returning: an ERC-4337
      // bundle can land while the call inside it reverts.
      const after = await suiteIdentity.identityStatus(user);
      if (after.identityId !== 0n && after.sellerBound && after.buyerBound) {
        signed += 1;
        console.log(`set up  ${user} (record ${after.identityId})`);
      } else {
        failed += 1;
        failures.push(`${user}: calls returned but the record is still incomplete`);
      }
    } catch (err) {
      failed += 1;
      failures.push(`${user}: ${(err as Error).message.split('\n')[0]}`);
    }
  }

  console.log('');
  console.log('---');
  console.log(`${complete} already have a complete record`);
  console.log(execute ? `${signed} set up now (${toSign - attempted} left for a later run)` : `${toSign} Karwan can set up (re-run with --execute)`);
  console.log(`${ownWallet.length} hold their own wallet and set up their record themselves`);
  if (unreadable > 0) console.log(`${unreadable} could not be read; fix the RPC and run again before trusting the counts`);
  if (failed > 0) console.log(`${failed} failed`);
  if (failures.length > 0) {
    console.log('');
    for (const line of failures) console.log(`  ${line}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
