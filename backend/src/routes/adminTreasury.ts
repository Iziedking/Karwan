import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { logger } from '../logger.js';

/// Admin treasury route. Read-only — every write action (payout, sweep,
/// drain-old → new) is signed by the connected wallet on the frontend and
/// verified on-chain by the contract's `onlyOwner` modifier. Backend only
/// proxies balance reads + serves the page-state JSON.

export const adminTreasuryRoutes = new Hono();

adminTreasuryRoutes.use('*', requireAdmin);

const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const treasuryAbi = [
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
  {
    type: 'function',
    name: 'totalReserves',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

interface TreasuryView {
  address: string | null;
  label: string;
  configured: boolean;
  usdc: string | null;
  totalReserves: string | null;
  owner: string | null;
  keeper: string | null;
  error: string | null;
}

async function readTreasury(addr: string | undefined, label: string): Promise<TreasuryView> {
  if (!addr) {
    return {
      address: null,
      label,
      configured: false,
      usdc: null,
      totalReserves: null,
      owner: null,
      keeper: null,
      error: null,
    };
  }
  const usdcAddr = config.USDC_ADDR as `0x${string}`;
  try {
    const [usdcBal, totalReserves, owner, keeper] = await Promise.all([
      publicClient.readContract({
        address: usdcAddr,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [addr as `0x${string}`],
      }),
      publicClient.readContract({
        address: addr as `0x${string}`,
        abi: treasuryAbi,
        functionName: 'totalReserves',
      }),
      publicClient.readContract({
        address: addr as `0x${string}`,
        abi: treasuryAbi,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: addr as `0x${string}`,
        abi: treasuryAbi,
        functionName: 'keeper',
      }),
    ]);
    return {
      address: addr,
      label,
      configured: true,
      usdc: formatUnits(usdcBal as bigint, 6),
      totalReserves: formatUnits(totalReserves as bigint, 6),
      owner: (owner as string).toLowerCase(),
      keeper: (keeper as string).toLowerCase(),
      error: null,
    };
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, addr, label },
      'admin treasury read failed',
    );
    return {
      address: addr,
      label,
      configured: true,
      usdc: null,
      totalReserves: null,
      owner: null,
      keeper: null,
      error: 'read failed; contract may not be a KarwanTreasury',
    };
  }
}

/// Returns balances + owner/keeper for both treasuries side by side. The
/// frontend uses this to render the admin page and to client-side guard
/// the "are you connected as owner?" check before exposing write
/// affordances. The on-chain `onlyOwner` modifier is the real gate.
adminTreasuryRoutes.get('/', async (c) => {
  const liveAddr = (config as unknown as Record<string, string | undefined>).KARWAN_TREASURY_CONTRACT_ADDR;
  const v3Addr = (config as unknown as Record<string, string | undefined>).KARWAN_TREASURY_V3_ADDR;

  const [live, v3] = await Promise.all([
    readTreasury(liveAddr, 'live (fees flow here)'),
    readTreasury(v3Addr, 'v3 (real USYC, awaiting Circle whitelist)'),
  ]);

  return c.json({
    live,
    v3,
    usdc: config.USDC_ADDR,
  });
});
