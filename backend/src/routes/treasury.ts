import { Hono } from 'hono';
import { formatUnits, getAddress } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { logger } from '../logger.js';

/// Public USYC reserves readout. Read-only, no auth. Shows the protocol's real
/// USYC holdings (treasury + vault-routed stake) marked to the LIVE Hashnote
/// price feed, with the on-chain oracle as a conservative fallback. This is the
/// surface that lets the home page and /stake show the live USYC balance and
/// the yield it has accrued.
///
/// Why the live feed: the Arc Testnet on-chain USYC oracle is frozen (it stopped
/// updating in Feb 2026), so totalReserves() marks USYC at a stale price and
/// shows no movement. The real instrument keeps accruing; the live Hashnote feed
/// (https://usyc.dev.hashnote.com/api/price) is the moving reference. We surface
/// both and label which one each number uses.

export const treasuryRoutes = new Hono();

const HASHNOTE_PRICE_URL = 'https://usyc.dev.hashnote.com/api/price';
const USYC_DECIMALS = 6;
const ORACLE_DECIMALS = 18;
/// The on-chain oracle is treated as stale if its last update is older than this.
const ORACLE_STALE_MS = 36 * 60 * 60 * 1000;
const LIVE_PRICE_TTL_MS = 5 * 60 * 1000;

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
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
] as const;

const n6 = (v: bigint) => Number(formatUnits(v, USYC_DECIMALS));

let livePriceCache: { at: number; price: number; round: string; ts: number } | null = null;

async function liveHashnotePrice(): Promise<{ price: number; round: string; ts: number } | null> {
  const now = Date.now();
  if (livePriceCache && now - livePriceCache.at < LIVE_PRICE_TTL_MS) {
    return { price: livePriceCache.price, round: livePriceCache.round, ts: livePriceCache.ts };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(HASHNOTE_PRICE_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return livePriceCache;
    const j = (await res.json()) as { data?: { price?: string; roundId?: string; timestamp?: string } };
    if (!j.data?.price) return livePriceCache;
    const parsed = { price: Number(j.data.price), round: j.data.roundId ?? '?', ts: Number(j.data.timestamp ?? 0) * 1000 };
    livePriceCache = { at: now, ...parsed };
    return parsed;
  } catch {
    return livePriceCache;
  }
}

async function balanceOf(token: `0x${string}`, holder: `0x${string}`): Promise<bigint> {
  return (await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [holder] })) as bigint;
}

treasuryRoutes.get('/usyc', async (c) => {
  const cfg = config as unknown as Record<string, string | undefined>;
  const treasuryAddr =
    cfg.KARWAN_TREASURY_USYC_ADDR ?? cfg.KARWAN_TREASURY_V3_ADDR ?? cfg.KARWAN_TREASURY_CONTRACT_ADDR;
  const vaultAddr = cfg.KARWAN_VAULT_ADDR;
  if (!treasuryAddr) return c.json({ configured: false });

  const treasury = getAddress(treasuryAddr);
  const vault = vaultAddr ? getAddress(vaultAddr) : null;
  const usdcAddr = getAddress(config.USDC_ADDR);

  try {
    const [usycToken, oracle] = (await Promise.all([
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'usyc' }),
      publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'oracle' }),
    ])) as [`0x${string}`, `0x${string}`];

    const [round, live] = await Promise.all([
      publicClient.readContract({ address: oracle, abi: oracleAbi, functionName: 'latestRoundData' }) as Promise<
        readonly [bigint, bigint, bigint, bigint, bigint]
      >,
      liveHashnotePrice(),
    ]);

    const onchainPrice = Number(formatUnits(round[1] < 0n ? 0n : round[1], ORACLE_DECIMALS));
    const onchainUpdatedAt = Number(round[3]) * 1000;
    const onchainStale = Date.now() - onchainUpdatedAt > ORACLE_STALE_MS;
    // Mark to the live feed when we have it; otherwise the on-chain oracle.
    const markPrice = live?.price && live.price > 0 ? live.price : onchainPrice;
    const priceSource: 'live' | 'onchain' = live?.price && live.price > 0 ? 'live' : 'onchain';

    const [treasuryUsdc, treasuryUsyc] = await Promise.all([
      balanceOf(usdcAddr, treasury),
      balanceOf(usycToken, treasury),
    ]);
    const treasuryUsycN = n6(treasuryUsyc);
    const treasuryValue = treasuryUsycN * markPrice;

    let vaultBlock: {
      address: string;
      usycShares: number;
      usycValueUsd: number;
      outForYieldUsdc: number;
      yieldUsd: number;
    } | null = null;
    if (vault) {
      const [operator, outForYield] = (await Promise.all([
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'operator' }),
        publicClient.readContract({ address: vault, abi: vaultAbi, functionName: 'outForYield' }),
      ])) as [`0x${string}`, bigint];
      const operatorUsyc = n6(await balanceOf(usycToken, operator));
      const value = operatorUsyc * markPrice;
      const costBasis = n6(outForYield);
      vaultBlock = {
        address: vault,
        usycShares: operatorUsyc,
        usycValueUsd: value,
        outForYieldUsdc: costBasis,
        yieldUsd: Math.max(0, value - operatorUsyc),
      };
    }

    const combinedShares = treasuryUsycN + (vaultBlock?.usycShares ?? 0);
    const combinedValue = treasuryValue + (vaultBlock?.usycValueUsd ?? 0);
    // USYC launches at $1 par, so shares ~= USDC principal; appreciation = value - shares.
    const combinedYield = Math.max(0, combinedValue - combinedShares);

    return c.json({
      configured: true,
      price: {
        markUsd: markPrice,
        source: priceSource,
        liveUsd: live?.price ?? null,
        liveRound: live?.round ?? null,
        liveUpdatedAt: live?.ts ?? null,
        onchainUsd: onchainPrice,
        onchainUpdatedAt,
        onchainStale,
      },
      treasury: {
        address: treasury,
        idleUsdc: n6(treasuryUsdc),
        usycShares: treasuryUsycN,
        usycValueUsd: treasuryValue,
        yieldUsd: Math.max(0, treasuryValue - treasuryUsycN),
      },
      vault: vaultBlock,
      combined: {
        usycShares: combinedShares,
        usycValueUsd: combinedValue,
        yieldUsd: combinedYield,
        idleUsdc: n6(treasuryUsdc),
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'public usyc reserves read failed');
    return c.json({ configured: true, error: (err as Error).message }, 502);
  }
});
