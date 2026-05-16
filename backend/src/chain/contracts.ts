import { getContract, type Address } from 'viem';
import { config } from '../config.js';
import { publicClient } from './client.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';

function required(name: string, value: string | undefined): Address {
  if (!value) throw new Error(`${name} is not set in .env`);
  return value as Address;
}

export const jobBoard = getContract({
  address: required('KARWAN_JOBBOARD_ADDR', config.KARWAN_JOBBOARD_ADDR),
  abi: jobBoardAbi,
  client: publicClient,
});

export const escrow = getContract({
  address: required('KARWAN_ESCROW_ADDR', config.KARWAN_ESCROW_ADDR),
  abi: escrowAbi,
  client: publicClient,
});

export const reputation = getContract({
  address: required('KARWAN_REPUTATION_ADDR', config.KARWAN_REPUTATION_ADDR),
  abi: reputationAbi,
  client: publicClient,
});

export const usdc = required('USDC_ADDR', config.USDC_ADDR);
export const identityRegistry = required('IDENTITY_REGISTRY_ADDR', config.IDENTITY_REGISTRY_ADDR);

// EscrowState enum from KarwanEscrow: None=0, Funded=1, Settled=2, Disputed=3, Refunded=4.
export interface EscrowAccount {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  dealAmount: bigint;
  sellerNet: bigint;
  feeTotal: bigint;
  released: bigint;
  feeReleased: bigint;
  milestonesReleased: number;
  state: number;
}

// feeBps is immutable on the escrow contract, so it is safe to cache.
let _feeBpsCache: number | null = null;
export async function getEscrowFeeBps(): Promise<number> {
  if (_feeBpsCache === null) {
    _feeBpsCache = Number(await escrow.read.feeBps());
  }
  return _feeBpsCache;
}

export interface FundingBreakdown {
  feeTotal: bigint;
  buyerFee: bigint;
  sellerFee: bigint;
  sellerNet: bigint;
  fundedAmount: bigint;
}

/// Mirrors KarwanEscrow.fundEscrow math: 1.5% fee split evenly. Buyer transfers
/// in dealAmount + buyerFee; seller nets dealAmount - sellerFee.
export function computeFunding(dealAmountWei: bigint, feeBps: number): FundingBreakdown {
  const feeTotal = (dealAmountWei * BigInt(feeBps)) / 10000n;
  const buyerFee = feeTotal / 2n;
  const sellerFee = feeTotal - buyerFee;
  return {
    feeTotal,
    buyerFee,
    sellerFee,
    sellerNet: dealAmountWei - sellerFee,
    fundedAmount: dealAmountWei + buyerFee,
  };
}

/// Reads the escrow struct getter, which omits the dynamic milestonePcts array.
///
/// Cached with a short TTL because /api/deals/feed enrich()s up to 60 deals
/// per request, each issuing an `escrows` view call. The RPC cost is small but
/// real (~30-60ms each over a long-haul connection), and on-chain state only
/// changes when a write tx mines, which is observable via the bus and clears
/// the cache. SSE-driven UIs refresh themselves on relevant events, so a 10s
/// staleness window is invisible in practice.
const READ_ESCROW_TTL_MS = 10_000;
interface EscrowCacheEntry {
  value: EscrowAccount;
  expiresAt: number;
}
const escrowCache = new Map<string, EscrowCacheEntry>();

export function invalidateEscrowCache(jobId?: string) {
  if (!jobId) {
    escrowCache.clear();
    return;
  }
  escrowCache.delete(jobId.toLowerCase());
}

export async function readEscrow(jobId: string): Promise<EscrowAccount> {
  const key = jobId.toLowerCase();
  const now = Date.now();
  const cached = escrowCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const tuple = (await escrow.read.escrows([jobId as `0x${string}`])) as readonly [
    `0x${string}`,
    `0x${string}`,
    bigint,
    bigint,
    bigint,
    bigint,
    bigint,
    number,
    number,
  ];
  const value: EscrowAccount = {
    buyer: tuple[0],
    seller: tuple[1],
    dealAmount: tuple[2],
    sellerNet: tuple[3],
    feeTotal: tuple[4],
    released: tuple[5],
    feeReleased: tuple[6],
    milestonesReleased: tuple[7],
    state: tuple[8],
  };
  escrowCache.set(key, { value, expiresAt: now + READ_ESCROW_TTL_MS });
  return value;
}
