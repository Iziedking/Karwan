/// Moves existing users onto ONE deposit address — their own signup-wallet
/// address — on every EVM chain they already have a deposit wallet for.
///
/// Why: Circle's `createWallets` advances the address index PER CHAIN, so
/// provisioning lazily handed the same index to different users on different
/// chains. A live audit found 18 addresses shared across accounts, two of them
/// holding funds under two different owners at once. Deriving from the user's
/// own wallet pins one index per USER, which makes collisions impossible.
///
/// SAFETY
///   - DRY RUN BY DEFAULT. Prints the exact plan and writes nothing. Pass
///     --execute to apply.
///   - Superseded wallets are ARCHIVED to `legacyBridgeWallets`, never dropped.
///     They are real Circle wallets that may hold USDC, and their walletId is
///     the only way to reach those funds later.
///   - Funds are NOT moved. A funded old address is reported and archived; use
///     --sweep (separate, deliberate flag) to also transfer its USDC to the
///     user's unified address on the same chain.
///   - Web3 accounts are skipped: they have no Circle identity wallet to anchor
///     on, and their deposit wallets are unusable anyway (backend-signed
///     bridging is Circle-only).
///
/// Run: npm run wallets:unify-backfill              (dry run)
///      npm run wallets:unify-backfill -- --execute
///      npm run wallets:unify-backfill -- --execute --sweep

import { listAllAgentWallets, saveAgentWallets } from '../db/agentWallets.js';
import { initUsersStore, getUserByAddress } from '../db/users.js';
import { ensureSchema, pgEnabled } from '../db/client.js';
import { provisionUserBridgeWallet, type BridgeBlockchain } from '../circle/wallets.js';
import { executeContractCall } from '../chain/txs.js';
import { readSourceUsdcBalance } from '../chain/cctpClients.js';
import { CCTP_CHAINS, CCTP_CHAIN_KEYS, type CctpChainKey } from '../chain/cctpChains.js';
import { parseUnits } from 'viem';
import { logger } from '../logger.js';

const USDC_DECIMALS = 6;
/// Circle's derive endpoint is capped at 10 rps; stay well under it.
const PACE_MS = 250;

const CIRCLE_TO_KEY: Record<string, CctpChainKey> = {};
for (const k of CCTP_CHAIN_KEYS) {
  const circle = CCTP_CHAINS[k].circleBlockchain;
  if (circle) CIRCLE_TO_KEY[circle] = k;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const execute = process.argv.includes('--execute');
  const sweep = process.argv.includes('--sweep');

  if (!pgEnabled) {
    console.error('\n  REFUSING TO RUN: DATABASE_URL is not set. Run this where the data lives.\n');
    process.exit(2);
  }
  await ensureSchema().catch(() => {});
  await initUsersStore().catch(() => {});
  const all = await listAllAgentWallets();
  if (all.length === 0) {
    console.error('\n  Zero agent-wallet records. Wrong database? Refusing to continue.\n');
    process.exit(2);
  }

  console.log(
    `\n=== WALLET UNIFICATION BACKFILL ${execute ? '(EXECUTING)' : '(DRY RUN — nothing will be written)'} ===\n`,
  );
  if (execute && sweep) console.log('  --sweep is ON: funded old addresses will ALSO be emptied into the new one.\n');

  // CASCADE GUARD. One user's OLD deposit address can be ANOTHER user's
  // identity address — that is the whole collision this migration exists to
  // fix. Sweeping in sequence therefore chains: user A's funds land on A's
  // unified address, and if that address is user B's old deposit wallet, B's
  // sweep then carries A's money onward to B. That happened on the first run
  // and mis-delivered 24.946802 USDC. Never sweep FROM an address that is any
  // account's identity address; archive it and report it for manual handling.
  const identityAddresses = new Set(all.map((r) => r.userAddress.toLowerCase()));

  let planned = 0;
  let alreadyOk = 0;
  let skippedWeb3 = 0;
  let changed = 0;
  let sweptUsdc = 0;
  const failures: string[] = [];

  for (const rec of all) {
    const deposits = Object.entries(rec.bridgeWallets ?? {}).filter(
      ([chain]) => chain !== 'SOL-DEVNET',
    );
    if (deposits.length === 0) continue;

    const user = getUserByAddress(rec.userAddress);
    const anchor = user?.circleIdentityWalletId;
    if (!anchor) {
      skippedWeb3++;
      continue;
    }

    // The identity address IS the target address on every EVM chain.
    const target = rec.userAddress.toLowerCase();
    const stale = deposits.filter(([, w]) => w.address.toLowerCase() !== target);
    if (stale.length === 0) {
      alreadyOk++;
      continue;
    }

    planned++;
    console.log(`  ${rec.userAddress}`);
    const nextBridge = { ...(rec.bridgeWallets ?? {}) };
    const nextLegacy: Record<string, { walletId: string; address: string }[]> = {
      ...(rec.legacyBridgeWallets ?? {}),
    };
    let touched = false;

    for (const [chain, old] of stale) {
      const key = CIRCLE_TO_KEY[chain];
      const bal = key ? await readSourceUsdcBalance(key, old.address) : null;
      const held = bal !== null && Number(bal) > 0 ? Number(bal) : 0;
      console.log(
        `    ${chain.padEnd(14)} ${old.address} -> ${target}` +
          (held > 0 ? `   [holds ${bal} USDC]` : ''),
      );

      if (!execute) continue;

      try {
        const derived = await provisionUserBridgeWallet(
          rec.userAddress,
          chain as BridgeBlockchain,
          anchor,
        );
        await sleep(PACE_MS);
        if (derived.address.toLowerCase() !== target) {
          // Do not record an address that isn't the user's own; that would just
          // be a different kind of divergence.
          failures.push(`${rec.userAddress} ${chain}: derived ${derived.address}, expected ${target}`);
          continue;
        }

        const isSomeonesIdentity = identityAddresses.has(old.address.toLowerCase());
        if (held > 0 && sweep && isSomeonesIdentity) {
          failures.push(
            `${rec.userAddress} ${chain}: REFUSED to sweep ${bal} USDC from ${old.address} — that address is another account's identity, so the balance may not be theirs. Archived; handle manually.`,
          );
        } else if (held > 0 && sweep && key) {
          // Both wallets are ours, same chain, so this is a plain USDC transfer
          // from the superseded wallet into the unified one.
          try {
            const amount = parseUnits(bal as string, USDC_DECIMALS);
            const res = await executeContractCall(
              {
                walletId: old.walletId,
                contractAddress: CCTP_CHAINS[key].usdc,
                abiFunctionSignature: 'transfer(address,uint256)',
                abiParameters: [target, amount.toString()],
              },
              `unify-sweep(${chain} ${old.address} -> ${target})`,
            );
            sweptUsdc += held;
            console.log(`      swept ${bal} USDC  tx ${res.txHash}`);
          } catch (err) {
            // Sweep failure must not block the address switch: the old wallet
            // is archived, so the funds stay reachable either way.
            failures.push(`${rec.userAddress} ${chain}: sweep failed (${(err as Error).message})`);
          }
        }

        nextBridge[chain] = { walletId: derived.walletId, address: derived.address };
        (nextLegacy[chain] ??= []).push({ walletId: old.walletId, address: old.address });
        touched = true;
      } catch (err) {
        failures.push(`${rec.userAddress} ${chain}: derive failed (${(err as Error).message})`);
      }
    }

    if (execute && touched) {
      await saveAgentWallets({ ...rec, bridgeWallets: nextBridge, legacyBridgeWallets: nextLegacy });
      changed++;
      logger.info({ user: rec.userAddress }, 'deposit addresses unified onto identity address');
    }
  }

  console.log('\n=== SUMMARY ===\n');
  console.log(`  Accounts needing unification   ${planned}`);
  console.log(`  Already on one address         ${alreadyOk}`);
  console.log(`  Skipped (web3, no anchor)      ${skippedWeb3}`);
  if (execute) {
    console.log(`  Accounts updated               ${changed}`);
    if (sweep) console.log(`  USDC swept to new addresses    ${sweptUsdc.toFixed(6)}`);
  }
  if (failures.length > 0) {
    console.log(`\n  ${failures.length} problem(s):`);
    for (const f of failures) console.log(`    ${f}`);
  }
  if (!execute) {
    console.log('\n  Dry run only. Nothing was written. Re-run with --execute to apply.');
    console.log('  Add --sweep to also move USDC off the superseded addresses.\n');
  }
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\nbackfill failed:', (err as Error).message);
  process.exit(1);
});
