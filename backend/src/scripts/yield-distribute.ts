/// Daily yield distribution to Karwan stakers. Runs INSIDE the api
/// container; the only host-side requirement is `docker compose exec`.
///
/// Reads every active position from KarwanVault, computes each address's
/// pro-rata daily yield, optionally pulls the day's total USDC out of the
/// vault via withdrawForYield, then calls bulkCredit on
/// KarwanYieldDistributor so stakers can claim.
///
/// Idempotent within a day: tracks last-run date in
/// `data/yieldDistribution.json` and refuses to double-credit. Pass
/// `--force` to override (testing only).
///
/// Pass `--dry-run` to compute amounts and print the breakdown without
/// sending any transaction. Recommended on first run.
///
/// Signing: uses the operator's private key via OPERATOR_PRIVATE_KEY env
/// var. Do NOT commit this key. For mainnet, rotate the YieldDistributor
/// operator to a hardened wallet (Circle DCW or hardware-signed multisig)
/// and refactor this script to call through that signing surface instead.
///
/// Cron on the host (daily 09:00 UTC). The script compiles to dist/ with the
/// rest of the backend; there is no standalone .mjs under scripts/ any more.
///   0 9 * * * cd ~/karwan && docker compose exec -T karwan-api \
///     node dist/scripts/yield-distribute.js >> /var/log/karwan/yield.log 2>&1
///
/// If a run is missed, do NOT catch up by passing --force N times: this script
/// prices accrual off the vault's CURRENT positions, so that overpays anyone
/// who staked during the gap. Use yield-backfill.ts, which replays each missed
/// day against the vault state at that day's 09:00 block.
///
/// Required env (set in .env, picked up via docker compose env_file):
///   ARC_TESTNET_RPC_URL                Arc Testnet RPC endpoint
///   KARWAN_VAULT_ADDR                  live Gen 4 vault address
///   KARWAN_YIELD_DISTRIBUTOR_ADDR      YieldDistributor address (2026-06-04)
///   OPERATOR_PRIVATE_KEY               0x-prefixed hex (NOT the deployer)
///
/// Optional env:
///   USDC_ADDR                          defaults to 0x3600... on Arc
///   USER_DAILY_APY_BPS                 default 14 (≈5.1% APR)
///   YIELD_BUFFER_BPS                   default 500 (5% headroom check)
///   MIN_DISTRIBUTION_USDC              default 1000000 (1 USDC, 6 decimals)
///   YIELD_FUNDING_MODE                 'operator' (default) | 'vault'
///     operator: bulkCredit funded from operator's own USDC. Operator wallet
///               must hold >= today's total. No vault permissions needed.
///     vault:    operator calls vault.withdrawForYield(total) first, then
///               funds bulkCredit. Requires OPERATOR_PRIVATE_KEY's address
///               to equal vault.operator.
///
/// CLI flags:
///   --dry-run   compute + print breakdown, no tx
///   --force     ignore today's already-distributed lockout
///   --quiet     suppress per-staker logging, keep summary only

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { arcChain as buildArcChain, arcRpcUrls, arcTransport } from './arcRpc.js';
import 'dotenv/config';

const FLAGS = new Set(process.argv.slice(2));
const DRY_RUN = FLAGS.has('--dry-run');
const FORCE = FLAGS.has('--force');
const QUIET = FLAGS.has('--quiet');

/// Must match the path ops/heartbeats.ts reads, and must land inside the
/// host-mounted data dir (compose maps ./data -> /app/backend/data, and the
/// container's cwd is /app/backend). An extra 'backend' segment here writes to
/// an unmounted path: the daily lock is then lost on every container roll and
/// the diagnostics page never sees the run.
const STATE_PATH = resolve(process.cwd(), 'data', 'yieldDistribution.json');
const USDC_DECIMALS = 6;
const POSITION_STATE_ACTIVE = 1;

const RPC_URLS = arcRpcUrls();
const VAULT = process.env.KARWAN_VAULT_ADDR as Address | undefined;
const DISTRIBUTOR = process.env.KARWAN_YIELD_DISTRIBUTOR_ADDR as Address | undefined;
const USDC = (process.env.USDC_ADDR ?? '0x3600000000000000000000000000000000000000') as Address;
const PK = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
const DAILY_APY_BPS = BigInt(process.env.USER_DAILY_APY_BPS ?? '14');
const BUFFER_BPS = BigInt(process.env.YIELD_BUFFER_BPS ?? '500');
const MIN_DISTRIBUTION = BigInt(process.env.MIN_DISTRIBUTION_USDC ?? '1000000');
const FUNDING_MODE = (process.env.YIELD_FUNDING_MODE ?? 'operator').toLowerCase();
if (FUNDING_MODE !== 'operator' && FUNDING_MODE !== 'vault') {
  console.error(`YIELD_FUNDING_MODE must be 'operator' or 'vault' (got: ${FUNDING_MODE})`);
  process.exit(1);
}

if (!VAULT || !DISTRIBUTOR) {
  console.error('missing KARWAN_VAULT_ADDR / KARWAN_YIELD_DISTRIBUTOR_ADDR');
  process.exit(1);
}
if (!DRY_RUN && !PK) {
  console.error('OPERATOR_PRIVATE_KEY required (or use --dry-run)');
  process.exit(1);
}

const arcChain = buildArcChain(RPC_URLS);
const transport = arcTransport(RPC_URLS);

const publicClient = createPublicClient({ chain: arcChain, transport });
const account = PK ? privateKeyToAccount(PK) : null;
const walletClient = account
  ? createWalletClient({ account, chain: arcChain, transport })
  : null;

const vaultAbi = [
  { type: 'function', name: 'nextPositionId', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'positions',
    inputs: [{ type: 'uint256' }],
    outputs: [
      { type: 'address' }, // owner (agent or identity wallet)
      { type: 'uint256' }, // principal
      { type: 'uint256' }, // depositedAt
      { type: 'uint256' }, // cooldownStartedAt
      { type: 'uint256' }, // claimableAt
      { type: 'uint8' }, // state
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
] as const;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const distributorAbi = [
  {
    type: 'function',
    name: 'bulkCredit',
    inputs: [{ type: 'address[]' }, { type: 'uint256[]' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface State {
  lastDistributedDate: string | null;
  lastTxHash?: string;
  lastTotalUsdc?: string;
  lastStakerCount?: number;
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) return { lastDistributedDate: null };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as State;
  } catch {
    return { lastDistributedDate: null };
  }
}

function saveState(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function log(...args: unknown[]): void {
  if (!QUIET) console.log(...args);
}

async function run(): Promise<void> {
  const today = todayKey();
  const state = loadState();
  if (state.lastDistributedDate === today && !FORCE) {
    console.log(`already distributed today (${today}). pass --force to override.`);
    return;
  }

  // ── 1. Enumerate active positions ──────────────────────────────────
  const nextId = (await publicClient.readContract({
    address: VAULT!,
    abi: vaultAbi,
    functionName: 'nextPositionId',
  })) as bigint;

  log(`reading ${nextId} positions from vault ${VAULT}`);

  const positionResults = await Promise.allSettled(
    Array.from({ length: Number(nextId) }, (_, i) =>
      publicClient.readContract({
        address: VAULT!,
        abi: vaultAbi,
        functionName: 'positions',
        args: [BigInt(i)],
      }),
    ),
  );

  /// Aggregate per identity-resolved address. Multiple positions per user
  /// roll into one bulkCredit row, so the staker sees one credit per day
  /// regardless of how many positions they hold.
  const accrualByOwner = new Map<Address, bigint>();
  for (let i = 0; i < positionResults.length; i++) {
    const r = positionResults[i];
    if (!r || r.status !== 'fulfilled') continue;
    const [rawOwner, principal, , , , posState] = r.value as readonly [
      Address, bigint, bigint, bigint, bigint, number,
    ];
    if (posState !== POSITION_STATE_ACTIVE) continue;
    if (principal === 0n) continue;

    const dailyYield = (principal * DAILY_APY_BPS) / 10_000n;
    if (dailyYield === 0n) continue;

    /// Resolve agent → identity per karwan_reputation_agent_layer. A staker
    /// who deposited via their identity wallet maps to themselves; an
    /// agent wallet maps to its principal.
    const owner = (await publicClient.readContract({
      address: VAULT!,
      abi: vaultAbi,
      functionName: 'resolveOwner',
      args: [rawOwner],
    })) as Address;
    accrualByOwner.set(owner, (accrualByOwner.get(owner) ?? 0n) + dailyYield);
  }

  if (accrualByOwner.size === 0) {
    console.log('no active positions to credit. exiting.');
    return;
  }

  const stakers = [...accrualByOwner.keys()];
  const amounts = stakers.map((s) => accrualByOwner.get(s) ?? 0n);
  const total = amounts.reduce((acc, a) => acc + a, 0n);

  log(`active stakers: ${stakers.length}`);
  log(`day total:      ${formatUnits(total, USDC_DECIMALS)} USDC`);
  if (!QUIET) {
    for (let i = 0; i < stakers.length; i++) {
      log(`  ${stakers[i]} +${formatUnits(amounts[i] ?? 0n, USDC_DECIMALS)}`);
    }
  }

  if (total < MIN_DISTRIBUTION) {
    console.log(`total ${formatUnits(total, USDC_DECIMALS)} USDC below MIN_DISTRIBUTION; skipping.`);
    return;
  }

  // ── 2. Verify the funding source has the liquidity ────────────────
  const headroom = (total * (10_000n + BUFFER_BPS)) / 10_000n;
  const fundingSource: Address | null =
    FUNDING_MODE === 'vault' ? (VAULT as Address) : account ? account.address : null;
  if (FUNDING_MODE === 'operator' && !DRY_RUN && !account) {
    console.error('operator mode requires OPERATOR_PRIVATE_KEY for the balance check.');
    process.exit(1);
  }
  if (fundingSource) {
    const sourceBal = (await publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [fundingSource],
    })) as bigint;
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

  if (!walletClient || !account) {
    console.error('wallet client unavailable; cannot broadcast.');
    process.exit(1);
  }

  // ── 3. Optional: pull USDC from vault into operator (vault mode) ──
  if (FUNDING_MODE === 'vault') {
    log(`withdrawing ${formatUnits(total, USDC_DECIMALS)} USDC from vault → operator ${account.address}`);
    const withdrawHash = await walletClient.writeContract({
      address: VAULT!,
      abi: vaultAbi,
      functionName: 'withdrawForYield',
      args: [total],
    });
    await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
    log(`vault withdraw tx: ${withdrawHash}`);
  } else {
    log(`operator-funded mode: ${formatUnits(total, USDC_DECIMALS)} USDC from ${account.address}`);
  }

  // ── 4. Approve distributor if allowance short ─────────────────────
  const currentAllowance = (await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, DISTRIBUTOR!],
  })) as bigint;
  if (currentAllowance < total) {
    log(`approving distributor for ${formatUnits(total, USDC_DECIMALS)} USDC`);
    const approveHash = await walletClient.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DISTRIBUTOR!, total],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    log(`approve tx: ${approveHash}`);
  }

  // ── 5. bulkCredit ──────────────────────────────────────────────────
  log(`crediting ${stakers.length} stakers on distributor ${DISTRIBUTOR}`);
  const creditHash = await walletClient.writeContract({
    address: DISTRIBUTOR!,
    abi: distributorAbi,
    functionName: 'bulkCredit',
    args: [stakers, amounts],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: creditHash });
  console.log(`bulkCredit tx: ${creditHash} (block ${receipt.blockNumber})`);

  // ── 6. Persist daily lockout ───────────────────────────────────────
  saveState({
    lastDistributedDate: today,
    lastTxHash: creditHash,
    lastTotalUsdc: total.toString(),
    lastStakerCount: stakers.length,
  });
  console.log(`distribution complete for ${today}.`);
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('distribution failed:', message);
  process.exit(1);
});
