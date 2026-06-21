import { Hono } from 'hono';
import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { logger } from '../logger.js';
import { runUsycWrap } from '../chain/usycOrchestrator.js';

/// Admin USYC yield monitor. Read-only. Marks the platform's USYC holdings to
/// the live Hashnote oracle so the demo can show reserves earning yield in real
/// time. Two holders: the Treasury contract (entitled, holds its own USYC) and
/// the vault's operator EOA (the vault is NotPermissioned, so routed stake is
/// held in the operator EOA via withdrawForYield, tracked by vault.outForYield).

export const adminUsycRoutes = new Hono();
adminUsycRoutes.use('*', requireAdmin);

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const treasuryAbi = [
  { type: 'function', name: 'usyc', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'oracle', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'totalReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const vaultAbi = [
  { type: 'function', name: 'operator', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'outForYield', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const oracleAbi = [
  {
    type: 'function',
    name: 'latestRoundData',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { type: 'uint80' },
      { type: 'int256' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint80' },
    ],
  },
] as const;

/// USYC on Arc is 6 decimals; the oracle answer is 18 decimals (1e18 = $1.00).
const USYC_DECIMALS = 6;
const ORACLE_DECIMALS = 18;

function num(v: bigint, decimals: number): number {
  return Number(formatUnits(v, decimals));
}

async function readBalance(token: `0x${string}`, holder: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [holder],
  })) as bigint;
}

adminUsycRoutes.get('/', async (c) => {
  const cfg = config as unknown as Record<string, string | undefined>;
  const treasury = (cfg.KARWAN_TREASURY_USYC_ADDR ??
    cfg.KARWAN_TREASURY_V3_ADDR ??
    cfg.KARWAN_TREASURY_CONTRACT_ADDR) as `0x${string}` | undefined;
  const vault = cfg.KARWAN_VAULT_ADDR as `0x${string}` | undefined;
  const usdc = config.USDC_ADDR as `0x${string}`;

  if (!treasury) {
    return c.json({ configured: false, error: 'treasury address not set' });
  }

  try {
    const [usycToken, oracle] = (await Promise.all([
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'usyc' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'oracle' }),
    ])) as [`0x${string}`, `0x${string}`];

    const round = (await publicClient.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: 'latestRoundData',
    })) as readonly [bigint, bigint, bigint, bigint, bigint];
    const priceUsd = num(round[1] < 0n ? 0n : round[1], ORACLE_DECIMALS);
    const updatedAt = Number(round[3]) * 1000;

    // Treasury holder: holds its own USYC (entitled).
    const [treasuryUsdc, treasuryUsyc, totalReserves] = await Promise.all([
      readBalance(usdc, treasury),
      readBalance(usycToken, treasury),
      publicClient
        .readContract({ address: treasury, abi: treasuryAbi, functionName: 'totalReserves' })
        .catch(() => 0n) as Promise<bigint>,
    ]);
    const treasuryUsycN = num(treasuryUsyc, USYC_DECIMALS);

    // Vault holder: routed stake lives in the operator EOA; outForYield is the
    // USDC cost basis of what is out earning yield.
    let vaultBlock: {
      address: string;
      operator: string;
      operatorUsyc: number;
      operatorUsycValueUsd: number;
      outForYieldUsdc: number;
      yieldUsd: number;
    } | null = null;
    if (vault) {
      const [operator, outForYield] = (await Promise.all([
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'operator' }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'outForYield' }),
      ])) as [`0x${string}`, bigint];
      const operatorUsyc = await readBalance(usycToken, operator);
      const operatorUsycN = num(operatorUsyc, USYC_DECIMALS);
      const operatorValue = operatorUsycN * priceUsd;
      const costBasis = num(outForYield, USYC_DECIMALS);
      vaultBlock = {
        address: vault,
        operator,
        operatorUsyc: operatorUsycN,
        operatorUsycValueUsd: operatorValue,
        outForYieldUsdc: costBasis,
        // Yield on routed stake = current USYC value minus the USDC sent out.
        yieldUsd: Math.max(0, operatorValue - costBasis),
      };
    }

    return c.json({
      configured: true,
      usyc: {
        token: usycToken,
        oracle,
        priceUsd,
        // Appreciation versus the $1.00 par the fund launched at.
        appreciationPct: (priceUsd - 1) * 100,
        updatedAt,
      },
      treasury: {
        address: treasury,
        usdc: num(treasuryUsdc, USYC_DECIMALS),
        usycShares: treasuryUsycN,
        usycValueUsd: treasuryUsycN * priceUsd,
        // Treasury USYC bought at par appreciates with the oracle.
        yieldUsd: Math.max(0, treasuryUsycN * priceUsd - treasuryUsycN),
        totalReservesUsdc: num(totalReserves, USYC_DECIMALS),
      },
      vault: vaultBlock,
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'admin usyc monitor read failed');
    return c.json({ configured: true, error: (err as Error).message }, 502);
  }
});

/// One-click wrap. Runs the operator-signed orchestration (vault rebalance +
/// treasury sweep into USYC). `?dry=1` previews without signing. The signer is
/// USYC_OPERATOR_PRIVATE_KEY; on testnet that is the deployer EOA (whitelisted,
/// vault operator + treasury keeper). 503 when no operator key is configured.
adminUsycRoutes.post('/run', async (c) => {
  const dryRun = c.req.query('dry') === '1' || c.req.query('dryRun') === '1';
  try {
    const result = await runUsycWrap({ dryRun });
    return c.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const noKey = message.includes('USYC_OPERATOR_PRIVATE_KEY');
    logger.warn({ err: message, dryRun }, 'admin usyc run failed');
    return c.json({ ok: false, error: message }, noKey ? 503 : 502);
  }
});
