/// One-off remediation: credit stakers for days the daily cron did not run.
///
/// The daily script (yield-distribute.ts) computes accrual from the vault's
/// CURRENT positions, so replaying it N times with --force pays everyone N
/// days at today's stake. Anyone who staked during the outage would be
/// overpaid; anyone who exited would get nothing. This script instead reads
/// the vault at each missed day's 09:00 UTC block and credits exactly what
/// that day's cron would have credited, then posts the sum as one bulkCredit.
///
/// Requires an archive RPC (historical eth_call). Arc Testnet's public RPC
/// serves these.
///
/// Usage:
///   npm run yield:backfill -- --from 2026-07-04 --to 2026-07-14            (dry run)
///   npm run yield:backfill -- --from 2026-07-04 --to 2026-07-14 --execute
///
/// Flags:
///   --from / --to   inclusive UTC day range (YYYY-MM-DD). Required.
///   --execute       broadcast. Without it the script only prints the plan.
///   --force         re-credit days a previous backfill already covered.
///
/// Env: same as yield-distribute (ARC_TESTNET_RPC_URL, KARWAN_VAULT_ADDR,
/// KARWAN_YIELD_DISTRIBUTOR_ADDR, OPERATOR_PRIVATE_KEY).

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  parseAbi,
  type Address,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { arcChain as buildArcChain, arcRpcUrls, arcTransport } from './arcRpc.js';
import 'dotenv/config';

const ARGS = process.argv.slice(2);
const EXECUTE = ARGS.includes('--execute');
const FORCE = ARGS.includes('--force');

function argValue(name: string): string | undefined {
  const i = ARGS.indexOf(name);
  return i >= 0 ? ARGS[i + 1] : undefined;
}

const FROM_DAY = argValue('--from');
const TO_DAY = argValue('--to');

const STATE_PATH = resolve(process.cwd(), 'data', 'yieldBackfill.json');
const DISTRIBUTION_STATE_PATH = resolve(process.cwd(), 'data', 'yieldDistribution.json');

const USDC_DECIMALS = 6;
const POSITION_STATE_ACTIVE = 1;
const CRON_HOUR_UTC = 9;

const RPC_URLS = arcRpcUrls();
const VAULT = process.env.KARWAN_VAULT_ADDR as Address | undefined;
const DISTRIBUTOR = process.env.KARWAN_YIELD_DISTRIBUTOR_ADDR as Address | undefined;
const USDC = (process.env.USDC_ADDR ?? '0x3600000000000000000000000000000000000000') as Address;
const PK = process.env.OPERATOR_PRIVATE_KEY as `0x${string}` | undefined;
const DAILY_APY_BPS = BigInt(process.env.USER_DAILY_APY_BPS ?? '14');
const BUFFER_BPS = BigInt(process.env.YIELD_BUFFER_BPS ?? '500');

if (!VAULT || !DISTRIBUTOR) {
  console.error('missing KARWAN_VAULT_ADDR / KARWAN_YIELD_DISTRIBUTOR_ADDR');
  process.exit(1);
}
if (!FROM_DAY || !TO_DAY || !/^\d{4}-\d{2}-\d{2}$/.test(FROM_DAY) || !/^\d{4}-\d{2}-\d{2}$/.test(TO_DAY)) {
  console.error('--from YYYY-MM-DD and --to YYYY-MM-DD are required (inclusive, UTC)');
  process.exit(1);
}
if (EXECUTE && !PK) {
  console.error('OPERATOR_PRIVATE_KEY required to --execute');
  process.exit(1);
}

const arcChain = buildArcChain(RPC_URLS);
const transport = arcTransport(RPC_URLS);

/// The replay needs historical eth_call. Every RPC in the pool must be an
/// archive node; the public Arc endpoint is, and is the last-resort entry.
const publicClient: PublicClient = createPublicClient({ chain: arcChain, transport });
const account = PK ? privateKeyToAccount(PK) : null;
const walletClient = account
  ? createWalletClient({ account, chain: arcChain, transport })
  : null;

const vaultAbi = parseAbi([
  'function nextPositionId() view returns (uint256)',
  'function positions(uint256) view returns (address,uint256,uint256,uint256,uint256,uint8)',
  'function resolveOwner(address) view returns (address)',
]);
const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const distributorAbi = parseAbi(['function bulkCredit(address[],uint256[])']);

interface BackfillState {
  runs: { at: string; from: string; to: string; days: string[]; total: string; txHash: string }[];
}

function loadState(): BackfillState {
  if (!existsSync(STATE_PATH)) return { runs: [] };
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as BackfillState;
  } catch {
    return { runs: [] };
  }
}

function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    console.error('invalid --from / --to range');
    process.exit(1);
  }
  for (let t = start; t <= end; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/// The cron fires at 09:00 UTC; that is the vault state each missed run would
/// have seen. Binary-search the last block at or before that instant.
async function blockAtTimestamp(target: bigint, hi: bigint): Promise<bigint> {
  let lo = 0n;
  let best = 0n;
  while (lo <= hi) {
    const mid = (lo + hi) / 2n;
    const block = await publicClient.getBlock({ blockNumber: mid });
    if (block.timestamp <= target) {
      best = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  return best;
}

async function accrualAtBlock(blockNumber: bigint): Promise<Map<Address, bigint>> {
  const nextId = (await publicClient.readContract({
    address: VAULT!,
    abi: vaultAbi,
    functionName: 'nextPositionId',
    blockNumber,
  })) as bigint;

  const positions = await Promise.all(
    Array.from({ length: Number(nextId) }, (_, i) =>
      publicClient
        .readContract({
          address: VAULT!,
          abi: vaultAbi,
          functionName: 'positions',
          args: [BigInt(i)],
          blockNumber,
        })
        .catch(() => null),
    ),
  );

  const byOwner = new Map<Address, bigint>();
  const ownerCache = new Map<Address, Address>();

  for (const p of positions) {
    if (!p) continue;
    const [rawOwner, principal, , , , state] = p as readonly [Address, bigint, bigint, bigint, bigint, number];
    if (state !== POSITION_STATE_ACTIVE || principal === 0n) continue;

    const dailyYield = (principal * DAILY_APY_BPS) / 10_000n;
    if (dailyYield === 0n) continue;

    let owner = ownerCache.get(rawOwner);
    if (!owner) {
      owner = (await publicClient.readContract({
        address: VAULT!,
        abi: vaultAbi,
        functionName: 'resolveOwner',
        args: [rawOwner],
        blockNumber,
      })) as Address;
      ownerCache.set(rawOwner, owner);
    }
    byOwner.set(owner, (byOwner.get(owner) ?? 0n) + dailyYield);
  }
  return byOwner;
}

async function run(): Promise<void> {
  const days = daysBetween(FROM_DAY!, TO_DAY!);
  const state = loadState();

  const alreadyCovered = new Set(state.runs.flatMap((r) => r.days));
  const target = FORCE ? days : days.filter((d) => !alreadyCovered.has(d));
  const skipped = days.filter((d) => alreadyCovered.has(d));
  if (skipped.length && !FORCE) {
    console.log(`skipping ${skipped.length} day(s) a previous backfill already covered: ${skipped.join(', ')}`);
  }
  if (target.length === 0) {
    console.log('nothing to backfill.');
    return;
  }

  const head = await publicClient.getBlockNumber();
  const totals = new Map<Address, bigint>();

  console.log(`replaying ${target.length} day(s) against the vault at each 09:00 UTC block\n`);
  console.log('day          block      stakers  accrued');
  console.log('─'.repeat(48));

  for (const day of target) {
    const at = BigInt(Date.parse(`${day}T${String(CRON_HOUR_UTC).padStart(2, '0')}:00:00Z`) / 1000);
    if (at * 1000n > BigInt(Date.now())) {
      console.log(`${day}   (in the future, skipped)`);
      continue;
    }
    const block = await blockAtTimestamp(at, head);
    const accrual = await accrualAtBlock(block);
    let dayTotal = 0n;
    for (const [owner, amount] of accrual) {
      totals.set(owner, (totals.get(owner) ?? 0n) + amount);
      dayTotal += amount;
    }
    console.log(
      `${day}   ${String(block).padEnd(10)} ${String(accrual.size).padStart(7)}  ${formatUnits(dayTotal, USDC_DECIMALS)} USDC`,
    );
  }

  const stakers = [...totals.keys()].filter((s) => (totals.get(s) ?? 0n) > 0n);
  const amounts = stakers.map((s) => totals.get(s)!);
  const total = amounts.reduce((a, b) => a + b, 0n);

  if (stakers.length === 0 || total === 0n) {
    console.log('\nnothing accrued over the range. exiting.');
    return;
  }

  console.log(`\nowed to ${stakers.length} staker(s), ${formatUnits(total, USDC_DECIMALS)} USDC total:\n`);
  const ranked = stakers
    .map((s, i) => [s, amounts[i]!] as const)
    .sort((a, b) => (b[1] > a[1] ? 1 : -1));
  for (const [s, a] of ranked) {
    console.log(`  ${s}  +${formatUnits(a, USDC_DECIMALS)}`);
  }

  const headroom = (total * (10_000n + BUFFER_BPS)) / 10_000n;
  const fundingAddress = account?.address;
  if (fundingAddress) {
    const bal = (await publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [fundingAddress],
    })) as bigint;
    console.log(
      `\noperator ${fundingAddress}: ${formatUnits(bal, USDC_DECIMALS)} USDC (needs ${formatUnits(headroom, USDC_DECIMALS)} incl. buffer)`,
    );
    if (bal < headroom) {
      console.error('operator balance below required headroom. top up before running with --execute.');
      process.exit(2);
    }
  }

  if (!EXECUTE) {
    console.log('\ndry run. re-run with --execute to broadcast.');
    return;
  }
  if (!walletClient || !account) {
    console.error('wallet client unavailable; cannot broadcast.');
    process.exit(1);
  }

  const allowance = (await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, DISTRIBUTOR!],
  })) as bigint;
  if (allowance < total) {
    const approveHash = await walletClient.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: 'approve',
      args: [DISTRIBUTOR!, total],
      chain: arcChain,
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
    console.log(`\napprove tx: ${approveHash}`);
  }

  const creditHash = await walletClient.writeContract({
    address: DISTRIBUTOR!,
    abi: distributorAbi,
    functionName: 'bulkCredit',
    args: [stakers, amounts],
    chain: arcChain,
    account,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: creditHash });
  console.log(`bulkCredit tx: ${creditHash} (block ${receipt.blockNumber})`);

  state.runs.push({
    at: new Date().toISOString(),
    from: FROM_DAY!,
    to: TO_DAY!,
    days: target,
    total: total.toString(),
    txHash: creditHash,
  });
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

  /// Stop the daily cron from paying the last backfilled day a second time when
  /// it next fires. Only move the marker forward: if the cron has already run
  /// for a later day, rewinding it here would let that day be paid twice.
  const lastDay = target[target.length - 1]!;
  let priorDay: string | null = null;
  try {
    const prior = JSON.parse(readFileSync(DISTRIBUTION_STATE_PATH, 'utf8')) as { lastDistributedDate?: unknown };
    if (typeof prior.lastDistributedDate === 'string') priorDay = prior.lastDistributedDate;
  } catch {
    /* no prior state */
  }
  if (!priorDay || lastDay >= priorDay) {
    writeFileSync(
      DISTRIBUTION_STATE_PATH,
      JSON.stringify(
        { lastDistributedDate: lastDay, lastTxHash: creditHash, lastTotalUsdc: total.toString(), lastStakerCount: stakers.length },
        null,
        2,
      ),
      'utf8',
    );
  } else {
    console.log(`daily marker left at ${priorDay} (newer than the backfilled ${lastDay}).`);
  }

  console.log(`\nbackfill complete for ${target.length} day(s).`);
}

run().catch((err: unknown) => {
  console.error('backfill failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
