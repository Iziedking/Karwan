#!/usr/bin/env node
/**
 * Daily drain of platform fees from the legacy fee-sink treasury into the
 * USYC-whitelisted treasury, then sweep V4 into real Hashnote USYC.
 *
 * Runs as the operator key, which holds two roles after the one-time
 * setup tx that transferred ownership of the old treasury to it:
 *   - owner on the OLD treasury    so it can call payout
 *   - keeper on the USYC treasury  so it can call sweepToUSYC
 *
 * One run = two transactions:
 *   1. oldTreasury.payout(usycTreasury, balance)   - transfers USDC to V4
 *   2. usycTreasury.sweepToUSYC()                  - V4 subscribes idle USDC
 *
 * Skips the run entirely when the old treasury holds less than
 * MIN_DRAIN_USDC. Skips the sweep step when V4's resulting balance is
 * still below its on-chain idleThreshold (10 USDC by default).
 *
 * Idempotent within a day via data/treasuryDrain.json. Pass --force to
 * override. --dry-run prints the plan without broadcasting.
 *
 * Env vars:
 *   ARC_TESTNET_RPC_URL                   Arc Testnet RPC endpoint
 *   KARWAN_TREASURY_CONTRACT_ADDR         The legacy fee-sink treasury
 *   KARWAN_TREASURY_USYC_ADDR             V4 treasury (real USYC)
 *   USDC_ADDR                             defaults to Arc Testnet USDC
 *   OPERATOR_PRIVATE_KEY                  signer for both transactions
 *   MIN_DRAIN_USDC                        skip when old balance < this (6d).
 *                                         default 1_000_000 (1 USDC)
 *
 * CLI flags:
 *   --dry-run   compute + print, no broadcast
 *   --force     ignore today's already-drained lockout
 *   --quiet     suppress info logs, keep the summary
 *
 * Cron line (host crontab):
 *   30 8 * * * cd /home/karwan/karwan && docker compose exec -T karwan-api \
 *     node scripts/treasury-drain.mjs >> /var/log/karwan/treasury-drain.log 2>&1
 *
 *   (8:30 UTC puts the drain 30 min before the yield distribution at 9:00,
 *    so the V4 sweep lands its USDC into USYC before stakers see the
 *    day's distribution.)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import 'dotenv/config';

const FLAGS = new Set(process.argv.slice(2));
const DRY_RUN = FLAGS.has('--dry-run');
const FORCE = FLAGS.has('--force');
const QUIET = FLAGS.has('--quiet');

const STATE_PATH = resolve(process.cwd(), 'data', 'treasuryDrain.json');
const ARC_CHAIN_ID = 5042002;
const USDC_DECIMALS = 6;

const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
const OLD_TREASURY = process.env.KARWAN_TREASURY_CONTRACT_ADDR;
const USYC_TREASURY =
  process.env.KARWAN_TREASURY_USYC_ADDR ?? process.env.KARWAN_TREASURY_V3_ADDR;
const USDC = process.env.USDC_ADDR || '0x3600000000000000000000000000000000000000';
const PK = process.env.OPERATOR_PRIVATE_KEY;
const MIN_DRAIN = BigInt(process.env.MIN_DRAIN_USDC || '1000000');

if (!RPC_URL || !OLD_TREASURY || !USYC_TREASURY) {
  console.error(
    'missing ARC_TESTNET_RPC_URL / KARWAN_TREASURY_CONTRACT_ADDR / KARWAN_TREASURY_USYC_ADDR',
  );
  process.exit(1);
}
if (!DRY_RUN && !PK) {
  console.error('OPERATOR_PRIVATE_KEY required (or use --dry-run)');
  process.exit(1);
}

const arc = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const publicClient = createPublicClient({ chain: arc, transport: http(RPC_URL) });
const account = PK ? privateKeyToAccount(PK) : null;
const walletClient = account
  ? createWalletClient({ account, chain: arc, transport: http(RPC_URL) })
  : null;

const treasuryAbi = [
  {
    type: 'function',
    name: 'payout',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sweepToUSYC',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'idleThreshold',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'owner',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'keeper',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
];

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastDrainedDate: null };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { lastDrainedDate: null };
  }
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function log(...args) {
  if (!QUIET) console.log(...args);
}

async function run() {
  const today = todayKey();
  const state = loadState();
  if (state.lastDrainedDate === today && !FORCE) {
    console.log(`already drained today (${today}). pass --force to override.`);
    return;
  }

  // -- Verify role-holding before we burn gas on a tx that would revert. --
  const [oldOwner, v4Keeper, v4Owner] = await Promise.all([
    publicClient.readContract({
      address: OLD_TREASURY,
      abi: treasuryAbi,
      functionName: 'owner',
    }),
    publicClient.readContract({
      address: USYC_TREASURY,
      abi: treasuryAbi,
      functionName: 'keeper',
    }),
    publicClient.readContract({
      address: USYC_TREASURY,
      abi: treasuryAbi,
      functionName: 'owner',
    }),
  ]);

  const signer = account ? account.address : '<dry-run>';
  log(`signer:            ${signer}`);
  log(`old treasury:      ${OLD_TREASURY}`);
  log(`old owner:         ${oldOwner}`);
  log(`USYC treasury:     ${USYC_TREASURY}`);
  log(`USYC keeper:       ${v4Keeper}`);
  log(`USYC owner:        ${v4Owner}`);

  if (account) {
    const me = account.address.toLowerCase();
    if (oldOwner.toLowerCase() !== me) {
      console.error(
        `operator ${signer} is not the old treasury's owner. ` +
        `Run the one-time setup: oldTreasury.transferOwnership(${signer}) ` +
        `signed by the deployer.`,
      );
      process.exit(2);
    }
    if (v4Keeper.toLowerCase() !== me && v4Owner.toLowerCase() !== me) {
      console.error(
        `operator ${signer} is neither keeper nor owner of the USYC treasury. ` +
        `Run: usycTreasury.setKeeper(${signer}) signed by the owner.`,
      );
      process.exit(2);
    }
  }

  // -- Inspect balances + threshold. --
  const [oldUsdc, v4UsdcBefore, idleThreshold] = await Promise.all([
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [OLD_TREASURY],
    }),
    publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [USYC_TREASURY],
    }),
    publicClient.readContract({
      address: USYC_TREASURY,
      abi: treasuryAbi,
      functionName: 'idleThreshold',
    }),
  ]);

  log(`old USDC:          ${formatUnits(oldUsdc, USDC_DECIMALS)}`);
  log(`USYC USDC (pre):   ${formatUnits(v4UsdcBefore, USDC_DECIMALS)}`);
  log(`idle threshold:    ${formatUnits(idleThreshold, USDC_DECIMALS)}`);

  if (oldUsdc < MIN_DRAIN) {
    console.log(
      `old USDC ${formatUnits(oldUsdc, USDC_DECIMALS)} below MIN_DRAIN_USDC ` +
      `${formatUnits(MIN_DRAIN, USDC_DECIMALS)}; nothing to do.`,
    );
    return;
  }

  const v4UsdcAfterDrain = v4UsdcBefore + oldUsdc;
  const willSweep = v4UsdcAfterDrain > idleThreshold;
  log(
    `plan: payout ${formatUnits(oldUsdc, USDC_DECIMALS)} USDC to ${USYC_TREASURY}` +
    (willSweep
      ? `, then sweep ${formatUnits(v4UsdcAfterDrain - idleThreshold, USDC_DECIMALS)} USDC into USYC.`
      : `; resulting balance still below idle threshold, no sweep.`),
  );

  if (DRY_RUN) {
    console.log('dry-run complete. no tx broadcast.');
    return;
  }

  // -- Step 1: drain old treasury into V4 directly via payout. --
  log(`payout: oldTreasury -> usycTreasury, ${formatUnits(oldUsdc, USDC_DECIMALS)} USDC`);
  const payoutHash = await walletClient.writeContract({
    address: OLD_TREASURY,
    abi: treasuryAbi,
    functionName: 'payout',
    args: [USYC_TREASURY, oldUsdc],
  });
  await publicClient.waitForTransactionReceipt({ hash: payoutHash });
  log(`payout tx: ${payoutHash}`);

  // -- Step 2: sweep V4 into USYC, if it crossed the idle threshold. --
  let sweepHash = null;
  let sweepedUsdc = 0n;
  if (willSweep) {
    log(`sweepToUSYC: subscribing idle USDC into real Hashnote USYC`);
    sweepHash = await walletClient.writeContract({
      address: USYC_TREASURY,
      abi: treasuryAbi,
      functionName: 'sweepToUSYC',
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: sweepHash });
    sweepedUsdc = v4UsdcAfterDrain - idleThreshold;
    log(`sweep tx: ${sweepHash} (block ${receipt.blockNumber})`);
  } else {
    log('skip sweep: V4 balance still below idleThreshold.');
  }

  saveState({
    lastDrainedDate: today,
    lastDrainTxHash: payoutHash,
    lastDrainUsdc: oldUsdc.toString(),
    lastSweepTxHash: sweepHash,
    lastSweepUsdc: sweepedUsdc.toString(),
  });

  console.log(`drain + sweep complete for ${today}.`);
}

run().catch((err) => {
  console.error('drain failed:', err.message || err);
  process.exit(1);
});
