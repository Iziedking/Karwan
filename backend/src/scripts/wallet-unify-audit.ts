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
import { readSourceUsdcBalance, configuredRpcOverrides } from '../chain/cctpClients.js';
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

  // Every address we know of, mapped to the user(s) and role(s) claiming it.
  // Circle derives addresses from a per-chain index counter in one shared
  // wallet set, so the same address CAN legitimately be issued to different
  // users on different chains. That is invisible until you look for it, and it
  // breaks any code that treats an address as an identity — so name it here.
  const claims = new Map<string, Set<string>>();
  const claim = (addr: string | undefined, who: string) => {
    if (!addr) return;
    const k = addr.toLowerCase();
    const s = claims.get(k) ?? new Set<string>();
    s.add(who);
    claims.set(k, s);
  };
  for (const rec of all) {
    claim(rec.userAddress, `${rec.userAddress} (identity)`);
    for (const [chain, w] of Object.entries(rec.bridgeWallets ?? {})) {
      claim(w.address, `${rec.userAddress} (deposit:${chain})`);
    }
  }

  // Pass 1: the counting, which is pure local work over the records.
  const toRead: { user: string; chain: string; key: CctpChainKey; address: string }[] = [];
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
      if (key) toRead.push({ user: rec.userAddress, chain, key, address: w.address });
    }
  }

  // Pass 2: the balance reads. These hit public testnet RPCs, which are the slow
  // and flaky part, so they run in bounded parallel with a per-read timeout and
  // visible progress. Serial + untimed reads could hang the whole audit on one
  // stalled endpoint with nothing on screen to say so.
  const CONCURRENCY = 8;
  const READ_TIMEOUT_MS = 12_000;
  const RETRY_TIMEOUT_MS = 40_000;
  let done = 0;
  const stillUnknown: typeof toRead = [];
  const withTimeout = async (
    p: Promise<string | null>,
    ms: number,
  ): Promise<string | null | 'TIMEOUT'> => {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<'TIMEOUT'>((res) => {
      timer = setTimeout(() => res('TIMEOUT'), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const record = (t: (typeof toRead)[number], bal: string | null | 'TIMEOUT') => {
    if (bal === 'TIMEOUT') {
      stillUnknown.push(t);
      return;
    }
    if (bal !== null && Number(bal) > 0) {
      funded.push({ user: t.user, chain: t.chain, address: t.address, usdc: bal });
    }
  };

  console.log(`\n  Reading ${toRead.length} on-chain balance(s)…`);
  for (let i = 0; i < toRead.length; i += CONCURRENCY) {
    const batch = toRead.slice(i, i + CONCURRENCY);
    const balances = await Promise.all(
      batch.map((t) => withTimeout(readSourceUsdcBalance(t.key, t.address), READ_TIMEOUT_MS)),
    );
    batch.forEach((t, j) => record(t, balances[j] ?? null));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${toRead.length} read…`);
  }
  console.log('');

  // Retry pass. A timed-out read is an UNKNOWN balance, and an unknown balance
  // is exactly the thing that could get stranded by a migration, so chase it
  // rather than shipping the gap. Serial and patient: there are only a handful,
  // and the public testnet RPCs that time out are the ones under load.
  if (stillUnknown.length > 0) {
    const retry = [...stillUnknown];
    stillUnknown.length = 0;
    console.log(`  Retrying ${retry.length} slow read(s) with a longer timeout…`);
    for (const t of retry) {
      record(t, await withTimeout(readSourceUsdcBalance(t.key, t.address), RETRY_TIMEOUT_MS));
    }
  }
  if (stillUnknown.length > 0) {
    console.log(
      `\n  NOTE: ${stillUnknown.length} balance(s) could NOT be read even on retry:`,
    );
    for (const t of stillUnknown) {
      console.log(`    ${t.chain.padEnd(16)} ${t.address}  (user ${t.user})`);
    }
    console.log('  Treat these as UNKNOWN, never as empty.');
    const overrides = configuredRpcOverrides();
    const chainsAffected = [...new Set(stillUnknown.map((t) => t.key))];
    const missing = chainsAffected.filter((k) => !overrides.includes(k));
    if (missing.length > 0) {
      console.log(
        `  These chains have NO private RPC configured: ${missing.join(', ')}.\n` +
          `  Set ${missing.map((k) => `CCTP_RPC_URL_${k.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()}`).join(', ')} and re-run.`,
      );
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

  const shared = [...claims.entries()]
    .map(([address, who]) => ({ address, who: [...who] }))
    .filter((c) => new Set(c.who.map((w) => w.split(' ')[0])).size > 1);

  console.log('\n=== ADDRESSES CLAIMED BY MORE THAN ONE USER ===\n');
  if (shared.length === 0) {
    console.log('  None. Every address maps to exactly one account.\n');
  } else {
    console.log(
      `  ${shared.length} address(es) are shared across accounts. This is Circle's\n` +
        '  per-chain index counter, not corruption, but any code that resolves a\n' +
        '  user FROM an address can mis-attribute. Chain-scope those lookups.\n',
    );
    for (const c of shared) {
      console.log(`    ${c.address}`);
      for (const w of c.who) console.log(`      claimed by ${w}`);
    }
    console.log('');
  }

  console.log('\n=== THE NUMBER THAT MATTERS: old addresses holding USDC ===\n');
  if (funded.length === 0 && stillUnknown.length > 0) {
    // A timed-out read is not evidence of an empty wallet. Say so rather than
    // let silence read as an all-clear.
    console.log(`  No balances found, BUT ${stillUnknown.length} balance(s) are UNKNOWN.`);
    console.log('  => INCONCLUSIVE. Re-run before treating this as a clean cutover.\n');
  } else if (funded.length === 0) {
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
