/// READ-ONLY audit for the one-address-per-user migration.
///
/// Today every user has a separate deposit wallet per source chain, created by
/// its own lazy `createWallets` call, so the addresses diverge (see
/// docs: Circle's index counter advances per chain). The migration replaces
/// them with ONE address derived from the signup wallet.
///
/// The number that actually decides how hard that migration is: how much USDC
/// is sitting on the OLD divergent addresses. Derive does NOT move funds, so
/// any address holding a balance must stay monitored rather than retired.
/// This script counts that, and changes nothing.
///
/// Run: npm run wallets:unify-audit

import { listAllAgentWallets } from '../db/agentWallets.js';
import { initUsersStore, getUserByAddress } from '../db/users.js';
import { ensureSchema, pgEnabled } from '../db/client.js';
import { readSourceUsdcBalance } from '../chain/cctpClients.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS, type CctpChainKey } from '../chain/cctpChains.js';

/// Circle blockchain enum -> our CCTP chain key, for the balance read. Solana
/// is excluded: it can never share an EVM address, so it is out of scope for
/// unification and its balance is not part of this decision.
const CIRCLE_TO_KEY: Record<string, CctpChainKey> = {};
for (const k of CCTP_CHAIN_KEYS) {
  const circle = CCTP_CHAINS[k].circleBlockchain;
  if (circle) CIRCLE_TO_KEY[circle] = k;
}

/// Records to audit. Normally read from the database; with `--from-json <path>`
/// read from a psql dump instead, so the audit can run from a laptop against a
/// VPS whose Postgres isn't reachable from outside. The dump shape is whatever
/// the documented one-liner produces: [{ "u": "0x…", "b": { "BASE-SEPOLIA":
/// { "walletId": "…", "address": "0x…" } } }, …]
async function loadRecords(): Promise<
  { userAddress: string; bridgeWallets?: Record<string, { walletId: string; address: string }> }[]
> {
  const flag = process.argv.indexOf('--from-json');
  const path = flag === -1 ? undefined : process.argv[flag + 1];
  if (!path) throw new Error('--from-json needs a file path');
  const { readFileSync } = await import('node:fs');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as { u: string; b: unknown }[];
  return raw.map((r) => ({
    userAddress: String(r.u).toLowerCase(),
    ...(r.b && typeof r.b === 'object'
      ? { bridgeWallets: r.b as Record<string, { walletId: string; address: string }> }
      : {}),
  }));
}

async function main() {
  const fromJson = process.argv.includes('--from-json');
  // Refuse to run against a store that clearly isn't the real one. Without this
  // the audit reads an empty local flat file and prints a confident "nothing can
  // be stranded" — the most dangerous possible wrong answer, because it green-
  // lights a cutover on evidence that was never collected.
  if (!fromJson && !pgEnabled) {
    console.error(
      '\n  REFUSING TO RUN: DATABASE_URL is not set, so this would read the local\n' +
        '  flat-file store, not the real one. An empty result here means "no data\n' +
        '  loaded", NOT "no users at risk".\n\n' +
        '  Run it where the data lives, either:\n' +
        '    - on the VPS:  docker compose exec karwan-api node dist/scripts/wallet-unify-audit.js\n' +
        '    - or from a dump: npm run wallets:unify-audit -- --from-json ./dump.json\n',
    );
    process.exit(2);
  }

  let all: {
    userAddress: string;
    bridgeWallets?: Record<string, { walletId: string; address: string }>;
  }[];
  if (fromJson) {
    all = await loadRecords();
    console.log(`\n  (reading ${all.length} record(s) from dump, not from the database)`);
  } else {
    await ensureSchema().catch(() => {});
    await initUsersStore().catch(() => {});
    all = await listAllAgentWallets();
  }

  if (all.length === 0) {
    console.error(
      '\n  Connected to Postgres but found ZERO agent-wallet records.\n' +
        '  That is either a genuinely empty database or the wrong one. Confirm the\n' +
        '  connection points at the environment you actually care about before\n' +
        '  drawing any conclusion from this run.\n',
    );
    process.exit(2);
  }

  let usersWithDeposits = 0;
  let totalDepositWallets = 0;
  let alreadyUnified = 0;
  const chainCounts = new Map<string, number>();
  const funded: {
    user: string;
    chain: string;
    address: string;
    usdc: string;
  }[] = [];
  const perUserChains: number[] = [];

  for (const rec of all) {
    const bridges = Object.entries(rec.bridgeWallets ?? {});
    const evm = bridges.filter(([chain]) => chain !== 'SOL-DEVNET');
    if (evm.length === 0) continue;
    usersWithDeposits++;
    totalDepositWallets += evm.length;
    perUserChains.push(evm.length);

    const addrs = new Set(evm.map(([, w]) => w.address.toLowerCase()));
    // "Unified" for our purposes means every deposit wallet shares one address
    // AND that address is the user's own identity address (the signup wallet).
    const identity = rec.userAddress.toLowerCase();
    if (addrs.size === 1 && addrs.has(identity)) alreadyUnified++;

    for (const [chain, w] of evm) {
      chainCounts.set(chain, (chainCounts.get(chain) ?? 0) + 1);
      const key = CIRCLE_TO_KEY[chain];
      if (!key) continue;
      const bal = await readSourceUsdcBalance(key, w.address);
      if (bal !== null && Number(bal) > 0) {
        funded.push({ user: rec.userAddress, chain, address: w.address, usdc: bal });
      }
    }
  }

  // Only meaningful against the real store; a dump carries no users table.
  const circleUsers = fromJson
    ? null
    : all.filter((r) => !!getUserByAddress(r.userAddress)).length;

  console.log('\n=== WALLET UNIFICATION AUDIT (read-only) ===\n');
  console.log(`  Accounts with agent wallets      ${all.length}`);
  if (circleUsers !== null) {
    console.log(`  ...of which email/Circle accounts ${circleUsers}`);
  }
  console.log(`  Accounts with EVM deposit wallets ${usersWithDeposits}`);
  console.log(`  Total EVM deposit wallets         ${totalDepositWallets}`);
  console.log(`  Already on one unified address    ${alreadyUnified}`);
  if (perUserChains.length) {
    const max = Math.max(...perUserChains);
    const multi = perUserChains.filter((n) => n > 1).length;
    console.log(`  Users on more than one chain      ${multi} (max ${max} chains)`);
  }

  console.log('\n  Deposit wallets per chain:');
  for (const [chain, n] of [...chainCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${chain.padEnd(16)} ${n}`);
  }

  console.log('\n=== THE NUMBER THAT MATTERS: old addresses holding USDC ===\n');
  if (funded.length === 0) {
    console.log('  None. Every existing deposit wallet is empty.');
    console.log('  => Nothing can be stranded. The migration is safe to run as a');
    console.log('     straight cutover; old addresses need no ongoing monitoring.\n');
  } else {
    console.log(`  ${funded.length} address(es) hold USDC and MUST stay monitored:\n`);
    for (const f of funded) {
      console.log(`    ${f.usdc.padStart(12)} USDC  ${f.chain.padEnd(16)} ${f.address}`);
      console.log(`    ${''.padStart(12)}        user ${f.user}`);
    }
    console.log('');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('\naudit failed:', (err as Error).message);
  process.exit(1);
});
