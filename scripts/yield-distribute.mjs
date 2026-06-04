#!/usr/bin/env node
/**
 * Daily yield distribution to Karwan stakers.
 *
 * Reads every active position from KarwanVault, computes each address's
 * pro-rata daily yield, pulls the day's total USDC out of the vault via
 * withdrawForYield, then calls bulkCredit on KarwanYieldDistributor so
 * stakers can claim.
 *
 * Idempotent within a day: tracks last-run date in `data/yieldDistribution.json`
 * and refuses to double-credit. Pass `--force` to override (testing only).
 *
 * Pass `--dry-run` to compute amounts and print the breakdown without
 * sending any transaction. Recommended on first run.
 *
 * Signing: uses the operator's private key via OPERATOR_PRIVATE_KEY env
 * var. Do NOT commit this key. For mainnet, rotate the YieldDistributor
 * operator to a hardened wallet (Circle DCW or hardware-signed multisig)
 * and refactor this script to call through that signing surface instead.
 *
 * Env vars (read from process.env; source .env first):
 *   ARC_TESTNET_RPC_URL                   — Arc Testnet RPC endpoint
 *   KARWAN_VAULT_ADDR                     — live Gen 4 vault address
 *   KARWAN_YIELD_DISTRIBUTOR_ADDR         — deployed 2026-06-04
 *   USDC_ADDR                             — defaults to 0x3600... on Arc
 *   USER_DAILY_APY_BPS                    — default 14 (≈5.1% APR)
 *   OPERATOR_PRIVATE_KEY                  — 0x-prefixed hex private key
 *   YIELD_BUFFER_BPS                      — default 500 (5% slack over reserves)
 *   MIN_DISTRIBUTION_USDC                 — default 1000000 (1 USDC, 6d), skip if total < this
 *   YIELD_FUNDING_MODE                    — 'operator' (default) | 'vault'
 *     operator: bulkCredit funded from operator's own USDC balance. Operator
 *               wallet must hold >= today's total. No vault permissions needed
 *               beyond reads. Periodic top-ups from deployer or treasury.
 *     vault:    operator calls vault.withdrawForYield(total) to pull USDC, then
 *               funds bulkCredit. Requires OPERATOR_PRIVATE_KEY's address to
 *               equal vault.operator. Tightest coupling, no manual top-ups.
 *
 * CLI flags:
 *   --dry-run   compute + print breakdown, no tx
 *   --force     ignore today's already-distributed lockout
 *   --quiet     suppress per-staker logging, keep summary only
 *
 * Run: `node scripts/yield-distribute.mjs --dry-run` first to verify
 *      the math, then drop `--dry-run` to ship. Hook into cron with
 *      `0 9 * * * cd /path/to/karwan && node scripts/yield-distribute.mjs`.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import 'dotenv/config';

const FLAGS = new Set(process.argv.slice(2));
const DRY_RUN = FLAGS.has('--dry-run');
const FORCE = FLAGS.has('--force');
const QUIET = FLAGS.has('--quiet');

const STATE_PATH = resolve(process.cwd(), 'data', 'yieldDistribution.json');
const ARC_CHAIN_ID = 5042002;
const USDC_DECIMALS = 6;
const POSITION_STATE_ACTIVE = 1;

const RPC_URL = process.env.ARC_TESTNET_RPC_URL;
const VAULT = process.env.KARWAN_VAULT_ADDR;
const DISTRIBUTOR = process.env.KARWAN_YIELD_DISTRIBUTOR_ADDR;
const USDC = process.env.USDC_ADDR || '0x3600000000000000000000000000000000000000';
const PK = process.env.OPERATOR_PRIVATE_KEY;
const DAILY_APY_BPS = BigInt(process.env.USER_DAILY_APY_BPS || '14');
const BUFFER_BPS = BigInt(process.env.YIELD_BUFFER_BPS || '500');
const MIN_DISTRIBUTION = BigInt(process.env.MIN_DISTRIBUTION_USDC || '1000000');
const FUNDING_MODE = (process.env.YIELD_FUNDING_MODE || 'operator').toLowerCase();
if (FUNDING_MODE !== 'operator' && FUNDING_MODE !== 'vault') {
  console.error(`YIELD_FUNDING_MODE must be 'operator' or 'vault' (got: ${FUNDING_MODE})`);
  process.exit(1);
}

if (!RPC_URL || !VAULT || !DISTRIBUTOR) {
  console.error('missing ARC_TESTNET_RPC_URL / KARWAN_VAULT_ADDR / KARWAN_YIELD_DISTRIBUTOR_ADDR');
  process.exit(1);
}
if (!DRY_RUN && !PK) {
  console.error('OPERATOR_PRIVATE_KEY required (or use --dry-run)');
  process.exit(1);
}

const arcChain = {
  id: ARC_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

const publicClient = createPublicClient({ chain: arcChain, transport: http(RPC_URL) });
const account = PK ? privateKeyToAccount(PK) : null;
const walletClient = account
  ? createWalletClient({ account, chain: arcChain, transport: http(RPC_URL) })
  : null;

const vaultAbi = [
  { type: 'function', name: 'nextPositionId', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'positions',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { type: 'address' },   // owner (agent or identity wallet)
      { type: 'uint256' },   // principal
      { type: 'uint256' },   // depositedAt
      { type: 'uint256' },   // cooldownStartedAt
      { type: 'uint256' },   // claimableAt
      { type: 'uint8' },     // state
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'resolveOwner',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'withdrawForYield',
    inputs: [{ type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const erc20Abi = [
  { type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
];

const distributorAbi = [
  {
    type: 'function',
    name: 'bulkCredit',
    inputs: [{ type: 'address[]' }, { type: 'uint256[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  if (!existsSync(STATE_PATH)) return { lastDistributedDate: null };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { lastDistributedDate: null };
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
  if (state.lastDistributedDate === today && !FORCE) {
    console.log(`already distributed today (${today}). pass --force to override.`);
    return;
  }

  // ── 1. Enumerate active positions ────────────────────────────────
  const nextId = await publicClient.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'nextPositionId',
  });

  log(`reading ${nextId} positions from vault ${VAULT}`);

  const positionResults = await Promise.allSettled(
    Array.from({ length: Number(nextId) }, (_, i) =>
      publicClient.readContract({
        address: VAULT,
        abi: vaultAbi,
        functionName: 'positions',
        args: [BigInt(i)],
      }),
    ),
  );

  /// Aggregate per identity-resolved address. Multiple positions per user
  /// roll into one bulkCredit row, so the staker sees one credit per day
  /// regardless of how many positions they hold.
  const accrualByOwner = new Map();
  for (let i = 0; i < positionResults.length; i++) {
    const r = positionResults[i];
    if (r.status !== 'fulfilled') continue;
    const [rawOwner, principal, _depositedAt, _cooldownStartedAt, _claimableAt, posState] = r.value;
    if (posState !== POSITION_STATE_ACTIVE) continue;
    if (principal === 0n) continue;

    const dailyYield = (principal * DAILY_APY_BPS) / 10_000n;
    if (dailyYield === 0n) continue;

    /// Resolve agent → identity per [[karwan_reputation_agent_layer]]. A
    /// staker who deposited via their identity wallet maps to themselves;
    /// an agent wallet maps to its principal.
    const owner = await publicClient.readContract({
      address: VAULT,
      abi: vaultAbi,
      functionName: 'resolveOwner',
      args: [rawOwner],
    });
    accrualByOwner.set(owner, (accrualByOwner.get(owner) || 0n) + dailyYield);
  }

  if (accrualByOwner.size === 0) {
    console.log('no active positions to credit. exiting.');
    return;
  }

  const stakers = [...accrualByOwner.keys()];
  const amounts = stakers.map((s) => accrualByOwner.get(s));
  const total = amounts.reduce((acc, a) => acc + a, 0n);

  log(`active stakers: ${stakers.length}`);
  log(`day total:      ${formatUnits(total, USDC_DECIMALS)} USDC`);
  if (!QUIET) {
    for (let i = 0; i < stakers.length; i++) {
      log(`  ${stakers[i]} +${formatUnits(amounts[i], USDC_DECIMALS)}`);
    }
  }

  if (total < MIN_DISTRIBUTION) {
    console.log(`total ${formatUnits(total, USDC_DECIMALS)} USDC below MIN_DISTRIBUTION; skipping.`);
    return;
  }

  // ── 2. Verify the funding source has the liquidity ──────────────
  const headroom = (total * (10_000n + BUFFER_BPS)) / 10_000n;
  const fundingSource = FUNDING_MODE === 'vault' ? VAULT : (account ? account.address : null);
  if (FUNDING_MODE === 'operator' && !DRY_RUN && !account) {
    console.error('operator mode requires OPERATOR_PRIVATE_KEY for the balance check.');
    process.exit(1);
  }
  if (fundingSource) {
    const sourceBal = await publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [fundingSource],
    });
    if (sourceBal < headroom) {
      console.error(
        `${FUNDING_MODE} USDC ${formatUnits(sourceBal, USDC_DECIMALS)} below required headroom ${formatUnits(headroom, USDC_DECIMALS)} (total + ${BUFFER_BPS}bps buffer).`,
      );
      console.error(
        FUNDING_MODE === 'operator'
          ? `Top up the operator wallet ${fundingSource} with USDC before next run.`
          : 'Manual vault unwrap or pause distribution.',
      );
      process.exit(2);
    }
  }

  if (DRY_RUN) {
    console.log(`dry-run complete (funding mode: ${FUNDING_MODE}). no tx broadcast.`);
    return;
  }

  // ── 3. Optional: pull USDC from vault into operator (vault mode) ─
  if (FUNDING_MODE === 'vault') {
    log(`withdrawing ${formatUnits(total, USDC_DECIMALS)} USDC from vault → operator ${account.address}`);
    const withdrawHash = await walletClient.writeContract({
      address: VAULT,
      abi: vaultAbi,
      functionName: 'withdrawForYield',
      args: [total],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    log(`vault withdraw tx: ${withdrawHash}`);
  } else {
    log(`operator-funded mode: ${formatUnits(total, USDC_DECIMALS)} USDC from ${account.address}`);
  }

  // ── 4. Approve distributor if allowance short ────────────────────
  const currentAllowance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, DISTRIBUTOR],
  });
  if (currentAllowance < total) {
    log(`approving distributor for ${formatUnits(total, USDC_DECIMALS)} USDC`);
    const approveHash = await walletClient.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DISTRIBUTOR, total],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    log(`approve tx: ${approveHash}`);
  }

  // ── 5. bulkCredit ──────────────────────────────────────────────
  log(`crediting ${stakers.length} stakers on distributor ${DISTRIBUTOR}`);
  const creditHash = await walletClient.writeContract({
    address: DISTRIBUTOR,
    abi: distributorAbi,
    functionName: 'bulkCredit',
    args: [stakers, amounts],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: creditHash });
  console.log(`bulkCredit tx: ${creditHash} (block ${receipt.blockNumber})`);

  // ── 6. Persist daily lockout ─────────────────────────────────────
  saveState({
    lastDistributedDate: today,
    lastTxHash: creditHash,
    lastTotalUsdc: total.toString(),
    lastStakerCount: stakers.length,
  });
  console.log(`distribution complete for ${today}.`);
}

run().catch((err) => {
  console.error('distribution failed:', err.message || err);
  process.exit(1);
});
