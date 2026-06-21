import { formatUnits, getAddress } from 'viem';
import { publicClient } from '../chain/client.js';
import { config } from '../config.js';

/// USYC integration proof. Read-only, no keys, no writes. Reads the live Arc
/// Testnet state and the live Hashnote price feed and prints a report a third
/// party can re-derive from a block explorer. Answers two questions:
///   1. Is real Hashnote USYC actually integrated? (does a Karwan contract hold
///      the whitelist-gated token, and does totalReserves mark it correctly?)
///   2. Is the yield growing? (the USYC price climbs over time; show the
///      on-chain round history and the live feed, and flag the testnet caveat.)
///
///   npm run usyc:prove   (from backend/)

const EXPLORER = 'https://testnet.arcscan.app';
const HASHNOTE_PRICE_URL = 'https://usyc.dev.hashnote.com/api/price';

const cfg = config as unknown as Record<string, string | undefined>;
const USDC = getAddress(config.USDC_ADDR);
const USYC = getAddress('0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C');
const ORACLE = getAddress('0x52b56c7642E71dc54714d879127d97cd0B3D4581');

// Prefer the whitelisted-USYC slot; fall back to the old V3 slot name, then to
// the generic contract slot some envs use for the same address.
const treasuryAddr =
  cfg.KARWAN_TREASURY_USYC_ADDR ?? cfg.KARWAN_TREASURY_V3_ADDR ?? cfg.KARWAN_TREASURY_CONTRACT_ADDR;
const vaultAddr = cfg.KARWAN_VAULT_ADDR;

const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const;
const oracleAbi = [
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'getRoundData', stateMutability: 'view', inputs: [{ type: 'uint80' }], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;
const treasuryAbi = [
  { type: 'function', name: 'totalReserves', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;

const usd = (v: bigint) => `${formatUnits(v, 6)} USDC`;
const balanceOf = (token: `0x${string}`, who: `0x${string}`) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] }) as Promise<bigint>;
const round = (id?: bigint) =>
  publicClient.readContract({
    address: ORACLE,
    abi: oracleAbi,
    functionName: id === undefined ? 'latestRoundData' : 'getRoundData',
    args: id === undefined ? [] : [id],
  }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>;

// USYC amount (6dp) marked to an 18dp price, returning a 6dp USDC value.
const markToUsdc = (usycAmount: bigint, price18: bigint) => (usycAmount * price18) / 10n ** 18n;
const day = (unix: bigint) => new Date(Number(unix) * 1000).toISOString().slice(0, 10);

async function liveFeed(): Promise<{ price: number; round: string; ts: number } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(HASHNOTE_PRICE_URL, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { price?: string; roundId?: string; timestamp?: string } };
    if (!j.data?.price) return null;
    return { price: Number(j.data.price), round: j.data.roundId ?? '?', ts: Number(j.data.timestamp ?? 0) };
  } catch {
    return null;
  }
}

async function main() {
  if (!treasuryAddr) {
    console.error('No treasury address. Set KARWAN_TREASURY_USYC_ADDR in .env.');
    process.exit(1);
  }
  const treasury = getAddress(treasuryAddr);
  const vault = vaultAddr ? getAddress(vaultAddr) : null;

  const head = await publicClient.getBlock();
  const headTs = head.timestamp;

  const [symbol, oracleDecimals] = await Promise.all([
    publicClient.readContract({ address: USYC, abi: erc20Abi, functionName: 'symbol' }) as Promise<string>,
    publicClient.readContract({ address: ORACLE, abi: oracleAbi, functionName: 'decimals' }) as Promise<number>,
  ]);

  const latest = await round();
  const first = await round(1n);
  const latestPrice = latest[1];
  const latestTs = latest[3];
  const firstPrice = first[1];
  const firstTs = first[3];

  const [tUsyc, tUsdc, tReserves, vUsyc, vUsdc] = await Promise.all([
    balanceOf(USYC, treasury),
    balanceOf(USDC, treasury),
    publicClient.readContract({ address: treasury, abi: treasuryAbi, functionName: 'totalReserves' }).catch(() => null) as Promise<bigint | null>,
    vault ? balanceOf(USYC, vault) : Promise.resolve(0n),
    vault ? balanceOf(USDC, vault) : Promise.resolve(0n),
  ]);

  const feed = await liveFeed();

  const onchainPriceHuman = Number(formatUnits(latestPrice, oracleDecimals));
  const tUsycValueOnchain = markToUsdc(tUsyc, latestPrice);
  const tUsycValueLive = feed ? markToUsdc(tUsyc, BigInt(Math.round(feed.price * 1e18))) : null;

  const climbPct = firstPrice > 0n ? (Number(latestPrice - firstPrice) / Number(firstPrice)) * 100 : 0;
  const climbDays = Number(latestTs - firstTs) / 86_400;
  const climbApr = climbDays > 0 ? (climbPct / climbDays) * 365 : 0;
  const oracleStaleDays = Number(headTs - latestTs) / 86_400;

  const line = '─'.repeat(64);
  console.log(`\n${line}\nKARWAN USYC INTEGRATION PROOF  (Arc Testnet, chain 5042002)\n${line}`);
  console.log(`chain head        ${day(headTs)}  (unix ${headTs})`);
  console.log(`token             ${symbol}  ${USYC}`);
  console.log(`  ${EXPLORER}/address/${USYC}`);

  console.log(`\n[1] INTEGRATION  does a Karwan contract hold real, gated USYC?`);
  console.log(`treasury          ${treasury}`);
  console.log(`  ${EXPLORER}/address/${treasury}`);
  console.log(`  USYC held       ${formatUnits(tUsyc, 6)} ${symbol}`);
  console.log(`  USDC liquid     ${usd(tUsdc)}`);
  console.log(`  totalReserves() ${tReserves === null ? 'unreadable' : usd(tReserves)}   (contract self-marks USYC + USDC)`);
  if (tReserves !== null) {
    const recomputed = tUsdc + tUsycValueOnchain;
    console.log(`  cross-check     ${usd(tUsdc)} + ${usd(tUsycValueOnchain)} (USYC @ oracle) = ${usd(recomputed)}`);
    const drift = tReserves > recomputed ? tReserves - recomputed : recomputed - tReserves;
    console.log(`  reconciles      ${drift <= 2n ? 'YES (within rounding)' : `off by ${usd(drift)}`}`);
  }
  console.log(`  verdict         ${tUsyc > 0n ? 'INTEGRATED. The contract holds a whitelist-gated Reg-S token; it could not without Circle/Hashnote entitlement.' : 'NO USYC HELD.'}`);

  console.log(`\nvault (staking)   ${vault ?? 'unset'}`);
  console.log(`  USYC held       ${formatUnits(vUsyc, 6)} ${symbol}`);
  console.log(`  USDC liquid     ${usd(vUsdc)}`);
  console.log(`  note            ${vUsyc > 0n ? 'staking pool is subscribed into USYC.' : 'staking pool is NOT wrapped into USYC; staker yield is operator-funded via the YieldDistributor.'}`);

  console.log(`\n[2] YIELD  is the USYC price climbing?`);
  console.log(`oracle            ${ORACLE}  (${oracleDecimals}dp)`);
  console.log(`  first round      $${Number(formatUnits(firstPrice, oracleDecimals)).toFixed(6)}  ${day(firstTs)}  (round ${first[0]})`);
  console.log(`  latest round     $${onchainPriceHuman.toFixed(6)}  ${day(latestTs)}  (round ${latest[0]})`);
  console.log(`  climb            +${climbPct.toFixed(4)}% over ${climbDays.toFixed(0)} days  (~${climbApr.toFixed(2)}% APR, real T-bill yield)`);
  console.log(`  treasury USYC worth ${usd(tUsycValueOnchain)} marked to this oracle`);

  if (oracleStaleDays > 2) {
    console.log(`\n  CAVEAT  the on-chain Arc Testnet oracle last updated ${day(latestTs)}, ${oracleStaleDays.toFixed(0)} days ago.`);
    console.log(`          It is frozen at round ${latest[0]}. totalReserves() therefore marks USYC at a stale price,`);
    console.log(`          so there is no live day-over-day movement from this oracle on testnet.`);
  }

  if (feed) {
    console.log(`\nlive Hashnote feed (the real instrument, still moving):`);
    console.log(`  ${HASHNOTE_PRICE_URL}`);
    console.log(`  price           $${feed.price.toFixed(6)}  ${day(BigInt(feed.ts))}  (round ${feed.round})`);
    const gap = ((feed.price - onchainPriceHuman) / onchainPriceHuman) * 100;
    console.log(`  vs on-chain      +${gap.toFixed(4)}% of real yield accrued that the frozen testnet oracle has not relayed`);
    if (tUsycValueLive !== null) {
      console.log(`  treasury USYC worth ${usd(tUsycValueLive)} marked to the live feed`);
    }
  } else {
    console.log(`\n  live Hashnote feed unreachable right now.`);
  }
  console.log(`\n${line}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('prove-usyc failed:', (err as Error).message);
    process.exit(1);
  });
