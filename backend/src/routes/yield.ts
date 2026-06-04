import { Hono } from 'hono';
import { z } from 'zod';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { executeContractCall } from '../chain/txs.js';
import { getUserByAddress } from '../db/users.js';
import { logger } from '../logger.js';

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

/// Per-staker yield snapshot. Returns claimable (current pull amount) plus a
/// rough lifetime hint via the contract's monotonic totals — the totals here
/// are protocol-wide, but the UI uses them to show "you have X claimable, and
/// the protocol has credited Y in total today." The frontend can also show
/// the user's count-up just from `claimable`.
yieldRoutes.get('/me', async (c) => {
  const distributor = distributorAddress();
  if (!distributor) {
    return c.json({
      configured: false,
      address: null,
      claimableUsdc: '0',
      detail: 'KARWAN_YIELD_DISTRIBUTOR_ADDR not set',
    });
  }
  const address = c.req.query('address') ?? '';
  const parsed = addrSchema.safeParse(address);
  if (!parsed.success) {
    return c.json({ error: 'address required' }, 400);
  }
  try {
    const claimable = (await publicClient.readContract({
      address: distributor,
      abi: distributorAbi,
      functionName: 'claimable',
      args: [parsed.data as `0x${string}`],
    })) as bigint;
    return c.json({
      configured: true,
      address: distributor,
      claimableUsdc: formatUnits(claimable, USDC_DECIMALS),
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
