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
const SCAN_CHUNK_RETRIES = 3;
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

interface MeSnapshot {
  claimableUsdc: string;
  lifetimeCreditedUsdc: string;
  lifetimeClaimedUsdc: string;
}

const meCache = new Map<string, { at: number; data: MeSnapshot }>();
const ME_TTL_MS = 30_000;

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
  /// `?fresh=1` skips the in-memory cache for one read. Used by the
  /// claim panel right after a successful claim so the button flips
  /// from "Claim N" to "Nothing yet" without waiting up to 30s for the
  /// next TTL window.
  const fresh = c.req.query('fresh') === '1';
  const cached = meCache.get(checksummed);
  if (!fresh && cached && Date.now() - cached.at < ME_TTL_MS) {
    return c.json({
      configured: true,
      address: distributor,
      ...cached.data,
    });
  }
  try {
    const head = await publicClient.getBlockNumber();
    const deploy = distributorDeployBlock();
    const fallbackBack = 14n * 24n * 60n * 60n / 1n;
    const start = deploy > 0n ? deploy : head > fallbackBack ? head - fallbackBack : 0n;

    const [claimable, creditedLogs, claimedLogs] = await Promise.all([
      publicClient.readContract({
        address: distributor,
        abi: distributorAbi,
        functionName: 'claimable',
        args: [checksummed],
      }) as Promise<bigint>,
      chunkedGetLogs({
        address: distributor,
        event: YieldCreditedEvent,
        fromBlock: start,
        toBlock: head,
        args: { staker: checksummed },
      }),
      chunkedGetLogs({
        address: distributor,
        event: YieldClaimedEvent,
        fromBlock: start,
        toBlock: head,
        args: { staker: checksummed },
      }),
    ]);

    let lifetimeCredited = 0n;
    for (const log of creditedLogs) lifetimeCredited += (log.args.amount as bigint | undefined) ?? 0n;
    let lifetimeClaimed = 0n;
    for (const log of claimedLogs) lifetimeClaimed += (log.args.amount as bigint | undefined) ?? 0n;

    const snapshot: MeSnapshot = {
      claimableUsdc: formatUnits(claimable, USDC_DECIMALS),
      lifetimeCreditedUsdc: formatUnits(lifetimeCredited, USDC_DECIMALS),
      lifetimeClaimedUsdc: formatUnits(lifetimeClaimed, USDC_DECIMALS),
    };
    meCache.set(checksummed, { at: Date.now(), data: snapshot });

    return c.json({
      configured: true,
      address: distributor,
      ...snapshot,
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
/// aggregate across every staker — the protocol's total accrual curve.
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

const historyCache = new Map<string, { at: number; data: HistoryPoint[] }>();
const HISTORY_TTL_MS = 30_000;

function distributorDeployBlock(): bigint {
  const v = (config as unknown as Record<string, string | undefined>)
    .KARWAN_YIELD_DISTRIBUTOR_DEPLOY_BLOCK;
  if (v && /^\d+$/.test(v)) return BigInt(v);
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

  const cacheKey = filterAddress ?? 'protocol';
  const fresh = c.req.query('fresh') === '1';
  const cached = historyCache.get(cacheKey);
  if (!fresh && cached && Date.now() - cached.at < HISTORY_TTL_MS) {
    return c.json({ configured: true, history: cached.data });
  }

  try {
    const head = await publicClient.getBlockNumber();
    const deploy = distributorDeployBlock();
    // Fallback to ~14 days of blocks at 1.2s avg if deploy block unknown.
    const fallbackBack = 14n * 24n * 60n * 60n / 1n;
    const start = deploy > 0n ? deploy : head > fallbackBack ? head - fallbackBack : 0n;

    const logs = await chunkedGetLogs({
      address: distributor,
      event: YieldCreditedEvent,
      fromBlock: start,
      toBlock: head,
      args: filterAddress ? { staker: filterAddress } : undefined,
    });

    /// Sum credits per unix day. The `day` topic on the event is
    /// `block.timestamp / 86400`, an integer day index.
    const perDay = new Map<number, bigint>();
    for (const log of logs) {
      const day = Number((log.args.day as bigint | number | undefined) ?? 0n);
      const amount = (log.args.amount as bigint | undefined) ?? 0n;
      perDay.set(day, (perDay.get(day) ?? 0n) + amount);
    }

    const sortedDays = [...perDay.keys()].sort((a, b) => a - b);
    let running = 0n;
    const history: HistoryPoint[] = [];
    for (const day of sortedDays) {
      const daily = perDay.get(day) ?? 0n;
      running += daily;
      const iso = new Date(day * 86_400_000).toISOString().slice(0, 10);
      history.push({
        day: iso,
        dailyCreditedUsdc: formatUnits(daily, USDC_DECIMALS),
        cumulativeCreditedUsdc: formatUnits(running, USDC_DECIMALS),
      });
    }

    historyCache.set(cacheKey, { at: Date.now(), data: history });
    return c.json({ configured: true, history });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'yield /history read failed');
    return c.json({ error: 'read failed', detail: (err as Error).message }, 502);
  }
});

/// Circle-user claim path. Web3 users sign `claim()` from their connected
/// wallet — they do not hit this route. Circle accounts route every
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
