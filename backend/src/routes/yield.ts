import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits, parseAbiItem, getAddress, type AbiEvent } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { executeContractCall } from '../chain/txs.js';
import { getUserByAddress } from '../db/users.js';
import { logger } from '../logger.js';

/// Arc public RPC silently returns empty on wide getLogs windows. Same fix
/// shape as backend/src/chain/networkStats.ts: chunk the scan into 5k-block
/// windows, retry each window up to 3 times, and run chunks in parallel
/// batches so the build finishes inside the route's request timeout even on
/// long ranges. Throws if any chunk fails every retry so the route returns
/// 502 rather than dressing up partial data.
const SCAN_CHUNK_BLOCKS = 5_000n;
const SCAN_CHUNK_RETRIES = 2;
const SCAN_CHUNK_BACKOFF_MS = 400;
const SCAN_CONCURRENCY = 8;

async function scanOneChunk(opts: {
  address: `0x${string}`;
  event: AbiEvent;
  fromBlock: bigint;
  toBlock: bigint;
  args?: Record<string, unknown>;
}): Promise<Array<{ args: Record<string, unknown> }>> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < SCAN_CHUNK_RETRIES; attempt++) {
    try {
      const logs = await publicClient.getLogs({
        address: opts.address,
        event: opts.event,
        fromBlock: opts.fromBlock,
        toBlock: opts.toBlock,
        args: opts.args as never,
      });
      return logs.map((l) => ({ args: (l.args ?? {}) as Record<string, unknown> }));
    } catch (err) {
      lastErr = err as Error;
      if (attempt < SCAN_CHUNK_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, SCAN_CHUNK_BACKOFF_MS * (attempt + 1)));
      }
    }
  }
  logger.warn(
    {
      err: lastErr?.message,
      address: opts.address,
      fromBlock: opts.fromBlock.toString(),
      toBlock: opts.toBlock.toString(),
    },
    'yield route chunk failed after retries',
  );
  throw lastErr ?? new Error('scan failed');
}

async function chunkedGetLogs(opts: {
  address: `0x${string}`;
  event: AbiEvent;
  fromBlock: bigint;
  toBlock: bigint;
  args?: Record<string, unknown>;
}): Promise<Array<{ args: Record<string, unknown> }>> {
  if (opts.fromBlock > opts.toBlock) return [];
  const windows: Array<{ from: bigint; to: bigint }> = [];
  let cursor = opts.fromBlock;
  while (cursor <= opts.toBlock) {
    const end = cursor + SCAN_CHUNK_BLOCKS - 1n;
    const windowEnd = end > opts.toBlock ? opts.toBlock : end;
    windows.push({ from: cursor, to: windowEnd });
    cursor = windowEnd + 1n;
  }
  const out: Array<{ args: Record<string, unknown> }> = [];
  for (let i = 0; i < windows.length; i += SCAN_CONCURRENCY) {
    const batch = windows.slice(i, i + SCAN_CONCURRENCY);
    const results = await Promise.all(
      batch.map((w) =>
        scanOneChunk({
          address: opts.address,
          event: opts.event,
          fromBlock: w.from,
          toBlock: w.to,
          args: opts.args,
        }),
      ),
    );
    for (const r of results) out.push(...r);
  }
  return out;
}

/// Yield distribution surface. The daily `scripts/yield-distribute.mjs` cron
/// reads vault positions, computes each staker's daily slice, and credits
/// the YieldDistributor contract via `bulkCredit`. Stakers pull from there
/// via `claim()`. This module exposes:
///   - GET /me?address=        per-staker claimable + lifetime totals
///   - GET /protocol           protocol-wide totals + distributor balance
///   - POST /claim             Circle-user signing path (web3 users sign
///                             from their wallet directly)
///
/// Tokens are denominated in USDC (6 decimals). The distributor holds USDC
/// that has already been pushed by the operator; the cron is the only thing
/// that ever credits balances on it.

export const yieldRoutes = new Hono();

const USDC_DECIMALS = 6;

const addrSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'expected 0x-prefixed 20-byte hex address');

const distributorAbi = [
  {
    type: 'function',
    name: 'claimable',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalCredited',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalClaimed',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'outstandingClaims',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'usdc',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

function distributorAddress(): `0x${string}` | null {
  const v = (config as unknown as Record<string, string | undefined>).KARWAN_YIELD_DISTRIBUTOR_ADDR;
  return v ? (v as `0x${string}`) : null;
}

/// Per-staker yield snapshot. Returns:
///   - claimableUsdc          live, from the contract view
///   - lifetimeCreditedUsdc   sum of YieldCredited for this staker (events)
///   - lifetimeClaimedUsdc    sum of YieldClaimed for this staker (events)
///
/// The lifetime totals come from event scans so we surface them without
/// needing per-address view functions on the contract. Both events are
/// indexed by staker so the RPC filter is cheap. Cached 30s per address.

const YieldClaimedEvent = parseAbiItem(
  'event YieldClaimed(address indexed staker, address indexed to, uint256 amount)',
);

yieldRoutes.get('/me', async (c) => {
  const distributor = distributorAddress();
  if (!distributor) {
    return c.json({
      configured: false,
      address: null,
      claimableUsdc: '0',
      lifetimeCreditedUsdc: '0',
      lifetimeClaimedUsdc: '0',
      detail: 'KARWAN_YIELD_DISTRIBUTOR_ADDR not set',
    });
  }
  const address = c.req.query('address') ?? '';
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) {
    return c.json({ error: 'address required' }, 400);
  }
  const checksummed = getAddress(parsed.data) as `0x${string}`;
  try {
    // claimable is a live contract view (cheap, always fresh). lifetimeClaimed
    // comes from the incremental index (no chain scan), and credited is derived
    // as claimable + claimed so the panel's three numbers always reconcile.
    const claimable = (await publicClient.readContract({
      address: distributor,
      abi: distributorAbi,
      functionName: 'claimable',
      args: [checksummed],
    })) as bigint;
    const lifetimeClaimed = indexedStakerClaimed(checksummed);
    const lifetimeCredited = claimable + lifetimeClaimed;

    return c.json({
      configured: true,
      address: distributor,
      claimableUsdc: formatUnits(claimable, USDC_DECIMALS),
      lifetimeCreditedUsdc: formatUnits(lifetimeCredited, USDC_DECIMALS),
      lifetimeClaimedUsdc: formatUnits(lifetimeClaimed, USDC_DECIMALS),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'yield /me read failed');
    return c.json({ error: 'read failed', detail: (err as Error).message }, 502);
  }
});

/// Protocol-wide reserves. Used by the /stake page widget to show how much
/// yield has been credited overall, how much has been claimed, and how much
/// USDC sits in the distributor's wallet right now (which should always
/// match outstanding + a tiny float).
yieldRoutes.get('/protocol', async (c) => {
  const distributor = distributorAddress();
  if (!distributor) {
    return c.json({ configured: false });
  }
  try {
    const [totalCredited, totalClaimed, outstanding, usdcAddr] = await Promise.all([
      publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'totalCredited',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'totalClaimed',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'outstandingClaims',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'usdc',
      }) as Promise<`0x${string}`>,
    ]);
    const usdcBal = (await publicClient.readContract({
      address: usdcAddr,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [distributor],
    })) as bigint;
    return c.json({
      configured: true,
      address: distributor,
      totalCreditedUsdc: formatUnits(totalCredited, USDC_DECIMALS),
      totalClaimedUsdc: formatUnits(totalClaimed, USDC_DECIMALS),
      outstandingUsdc: formatUnits(outstanding, USDC_DECIMALS),
      usdcBalance: formatUnits(usdcBal, USDC_DECIMALS),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'yield /protocol read failed');
    return c.json({ error: 'read failed', detail: (err as Error).message }, 502);
  }
});

/// Daily yield-distribution timeseries. Reads YieldCredited events from
/// the distributor and groups them by unix day to render the protocol
/// (or a single staker) distribution chart. Returns ascending by day.
///
/// Optional `address` query filters to a single staker. Without it, we
/// aggregate across every staker, the protocol's total accrual curve.
///
/// Cached for 30s in memory to absorb the chart's 30s poll without hammering
/// the RPC. Block range is bounded by KARWAN_YIELD_DISTRIBUTOR_DEPLOY_BLOCK
/// when set, otherwise scans the last ~14 days of blocks (1.2s avg block).

const YieldCreditedEvent = parseAbiItem(
  'event YieldCredited(address indexed staker, uint256 amount, uint32 indexed day)',
);

interface HistoryPoint {
  day: string;
  dailyCreditedUsdc: string;
  cumulativeCreditedUsdc: string;
}

function distributorDeployBlock(): bigint {
  const v = (config as unknown as Record<string, string | undefined>)
    .KARWAN_YIELD_DISTRIBUTOR_DEPLOY_BLOCK;
  if (v && /^\d+$/.test(v)) return BigInt(v);
  // Fallback: the vault deploy block. The distributor shipped in the same
  // bundle era, so this is a safe (and MUCH tighter) lower bound than the old
  // 14-day window that scanned ~1.2M blocks on every uncached call. Set
  // KARWAN_YIELD_DISTRIBUTOR_DEPLOY_BLOCK to the exact block to tighten further.
  const vault = config.KARWAN_VAULT_DEPLOY_BLOCK;
  if (vault && /^\d+$/.test(String(vault))) return BigInt(vault);
  return 0n;
}

yieldRoutes.get('/history', async (c) => {
  const distributor = distributorAddress();
  if (!distributor) {
    return c.json({ configured: false, history: [] });
  }

  const addressParam = c.req.query('address') ?? '';
  let filterAddress: `0x${string}` | null = null;
  if (addressParam) {
    const parsed = addrSchema.safeParse(addressParam);
    if (!parsed.success) {
      return c.json({ error: 'invalid address' }, 400);
    }
    filterAddress = getAddress(parsed.data) as `0x${string}`;
  }

  // Served from the incremental index (no chain scan). Empty only until the
  // first index pass completes after a brand-new deploy; instant after that.
  return c.json({ configured: true, history: indexedHistory(filterAddress) });
});

// ── Incremental yield index ──────────────────────────────────────────────
// The distributor's event history grows with chain height (millions of blocks),
// so re-scanning it on every read cost ~30s. Instead: scan once, checkpoint the
// last block plus the running totals, then only scan the new blocks since. Reads
// become a memory lookup. The checkpoint persists to disk so a restart resumes
// incrementally instead of re-walking the whole chain.

const INDEX_PATH = resolve(process.cwd(), 'data', 'yield-index.json');

interface YieldIndex {
  lastBlock: number;
  /// Protocol-wide daily credited totals (the chart): day index -> atomic USDC.
  perDayCredited: Record<string, string>;
  /// Per-staker daily credited (per-address chart): staker -> day -> atomic.
  perStakerDayCredited: Record<string, Record<string, string>>;
  /// Per-staker lifetime claimed (the /me number): staker -> atomic USDC.
  perStakerClaimed: Record<string, string>;
}

let yieldIndex: YieldIndex | null = null;

function emptyYieldIndex(): YieldIndex {
  return { lastBlock: 0, perDayCredited: {}, perStakerDayCredited: {}, perStakerClaimed: {} };
}

function loadYieldIndex(): YieldIndex {
  if (yieldIndex) return yieldIndex;
  try {
    if (existsSync(INDEX_PATH)) {
      yieldIndex = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as YieldIndex;
      return yieldIndex;
    }
  } catch {
    /* corrupt snapshot: rebuild from scratch */
  }
  yieldIndex = emptyYieldIndex();
  return yieldIndex;
}

function saveYieldIndex(): void {
  if (!yieldIndex) return;
  try {
    const dir = dirname(INDEX_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(INDEX_PATH, JSON.stringify(yieldIndex), 'utf8');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'yield index persist failed');
  }
}

let indexRefreshing = false;

/// Scan only the blocks added since the last checkpoint and fold them into the
/// running totals. The first call after a fresh deploy walks the full range once
/// (in the background); every later call scans a handful of new blocks.
async function refreshYieldIndex(): Promise<void> {
  const distributor = distributorAddress();
  if (!distributor || indexRefreshing) return;
  indexRefreshing = true;
  try {
    const state = loadYieldIndex();
    const deploy = distributorDeployBlock();
    const head = await publicClient.getBlockNumber();
    const from = BigInt(state.lastBlock > 0 ? state.lastBlock + 1 : Number(deploy));
    if (from > head) return;

    const [creditedLogs, claimedLogs] = await Promise.all([
      chunkedGetLogs({ address: distributor, event: YieldCreditedEvent, fromBlock: from, toBlock: head }),
      chunkedGetLogs({ address: distributor, event: YieldClaimedEvent, fromBlock: from, toBlock: head }),
    ]);

    for (const log of creditedLogs) {
      const staker = String(log.args.staker ?? '').toLowerCase();
      const dayKey = String(Number((log.args.day as bigint | number | undefined) ?? 0n));
      const amount = (log.args.amount as bigint | undefined) ?? 0n;
      state.perDayCredited[dayKey] = (BigInt(state.perDayCredited[dayKey] ?? '0') + amount).toString();
      if (staker) {
        const days = (state.perStakerDayCredited[staker] ??= {});
        days[dayKey] = (BigInt(days[dayKey] ?? '0') + amount).toString();
      }
    }
    for (const log of claimedLogs) {
      const staker = String(log.args.staker ?? '').toLowerCase();
      const amount = (log.args.amount as bigint | undefined) ?? 0n;
      if (staker) {
        state.perStakerClaimed[staker] = (BigInt(state.perStakerClaimed[staker] ?? '0') + amount).toString();
      }
    }

    state.lastBlock = Number(head);
    saveYieldIndex();
    logger.info(
      { from: from.toString(), head: head.toString(), credited: creditedLogs.length, claimed: claimedLogs.length },
      'yield index refreshed',
    );
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'yield index refresh failed');
  } finally {
    indexRefreshing = false;
  }
}

/// Cumulative daily distribution series from the index (protocol-wide, or one
/// staker when filtered). Pure lookup, no chain scan.
function indexedHistory(filterAddress: `0x${string}` | null): HistoryPoint[] {
  const state = loadYieldIndex();
  const source = filterAddress
    ? state.perStakerDayCredited[filterAddress.toLowerCase()] ?? {}
    : state.perDayCredited;
  const days = Object.keys(source)
    .map(Number)
    .sort((a, b) => a - b);
  let running = 0n;
  const history: HistoryPoint[] = [];
  for (const day of days) {
    const daily = BigInt(source[String(day)] ?? '0');
    running += daily;
    history.push({
      day: new Date(day * 86_400_000).toISOString().slice(0, 10),
      dailyCreditedUsdc: formatUnits(daily, USDC_DECIMALS),
      cumulativeCreditedUsdc: formatUnits(running, USDC_DECIMALS),
    });
  }
  return history;
}

/// A staker's lifetime claimed total from the index. Pure lookup.
function indexedStakerClaimed(addr: `0x${string}`): bigint {
  return BigInt(loadYieldIndex().perStakerClaimed[addr.toLowerCase()] ?? '0');
}

/// Start the incremental indexer: a full catch-up scan on boot (background),
/// then a light incremental scan every 90s. Returns a stop function.
export function startYieldIndexer(): () => void {
  const distributor = distributorAddress();
  if (!distributor) return () => {};
  const tick = () => {
    void refreshYieldIndex();
  };
  tick(); // catch up from the checkpoint at boot so reads are hot
  const id = setInterval(tick, 90_000);
  logger.info('yield indexer started');
  return () => clearInterval(id);
}

/// Circle-user claim path. Web3 users sign `claim()` from their connected
/// wallet. They do not hit this route. Circle accounts route every
/// transaction through their backend DCW, so we look up the user's
/// identity DCW walletId and call `claim()` on their behalf.
const claimSchema = z.object({ address: addrSchema });

yieldRoutes.post('/claim', async (c) => {
  const distributor = distributorAddress();
  if (!distributor) {
    return c.json({ error: 'distributor not configured' }, 503);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid body', detail: parsed.error.flatten() }, 400);
  }
  const { address } = parsed.data;
  const user = await getUserByAddress(address);
  if (!user?.circleIdentityWalletId) {
    return c.json(
      {
        error: 'no Circle wallet bound to this address',
        hint: 'Web3 users sign claim from their own wallet directly.',
      },
      400,
    );
  }
  const claimable = (await publicClient.readContract({
    address: distributor,
    abi: distributorAbi,
    functionName: 'claimable',
    args: [address as `0x${string}`],
  })) as bigint;
  if (claimable === 0n) {
    return c.json({ error: 'nothing to claim' }, 409);
  }
  try {
    const tx = await executeContractCall(
      {
        walletId: user.circleIdentityWalletId,
        contractAddress: distributor,
        abiFunctionSignature: 'claim()',
        abiParameters: [],
      },
      'yield.claim',
    );
    return c.json({ ok: true, txHash: tx?.txHash ?? null });
  } catch (err) {
    logger.warn({ err: (err as Error).message, address }, 'yield claim failed');
    return c.json({ error: 'claim failed', detail: (err as Error).message }, 502);
  }
});
