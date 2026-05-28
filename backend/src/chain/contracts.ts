import { getContract, type Address } from 'viem';
import { config } from '../config.js';
import { publicClient } from './client.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';
import { vaultAbi } from './abis/vault.js';
import { legacyEscrowAbi, LEGACY_ESCROW_STATE } from './abis/legacyEscrow.js';

function required(name: string, value: string | undefined): Address {
  if (!value) throw new Error(`${name} is not set in .env`);
  return value as Address;
}

function optional(value: string | undefined): Address | null {
  if (!value) return null;
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

/// Active KarwanVault (v2.D bundle). Holds stake positions, runs the
/// insurance reservation system, and is the source of truth for the
/// stake factor in the reputation engine.
export const vault = getContract({
  address: required('KARWAN_VAULT_ADDR', config.KARWAN_VAULT_ADDR),
  abi: vaultAbi,
  client: publicClient,
});

/// Legacy KarwanVault (pre-v2.D). Read-only during the migration window so
/// users don't lose tenure on positions they staked before the redeploy.
/// Returns null when KARWAN_VAULT_LEGACY_ADDR is unset (post-migration or
/// fresh environments). The dual-vault reader in reputation/stake.ts sums
/// principal across this and the active vault.
export const legacyVaultAddress: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_LEGACY_ADDR,
);

export const legacyVault = legacyVaultAddress
  ? getContract({ address: legacyVaultAddress, abi: vaultAbi, client: publicClient })
  : null;

/// Second-generation legacy KarwanVault. Filled when a redeploy promotes the
/// previous production vault into a legacy slot. Read alongside Gen 1 so
/// stakers on either contract surface on the /legacy page.
export const legacyVault2Address: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_LEGACY_ADDR_2,
);

export const legacyVault2 = legacyVault2Address
  ? getContract({ address: legacyVault2Address, abi: vaultAbi, client: publicClient })
  : null;

/// Pre-v2.D KarwanEscrow. Backs the 30-day recovery surface so buyers can
/// refund / cancel deals whose USDC is still locked on the legacy contract.
/// Returns null when KARWAN_ESCROW_LEGACY_ADDR is unset (post-window or
/// fresh environments).
export const legacyEscrowAddress: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_ESCROW_LEGACY_ADDR,
);

export const legacyEscrow = legacyEscrowAddress
  ? getContract({ address: legacyEscrowAddress, abi: legacyEscrowAbi, client: publicClient })
  : null;

/// Second-generation legacy KarwanEscrow. Same shape as Gen 1.
export const legacyEscrow2Address: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_ESCROW_LEGACY_ADDR_2,
);

export const legacyEscrow2 = legacyEscrow2Address
  ? getContract({ address: legacyEscrow2Address, abi: legacyEscrowAbi, client: publicClient })
  : null;

/// Per-generation registry. Each entry binds a generation number to its vault
/// + escrow addresses. Read this when you need to fan out a read across every
/// legacy contract (positions, deals, stake sum) or route a write to the right
/// contract by generation index. Order is Gen 1 first.
export interface LegacyGeneration {
  index: 1 | 2;
  vaultAddress: Address | null;
  vault: typeof legacyVault;
  escrowAddress: Address | null;
  escrow: typeof legacyEscrow;
}

export const legacyGenerations: LegacyGeneration[] = [
  {
    index: 1,
    vaultAddress: legacyVaultAddress,
    vault: legacyVault,
    escrowAddress: legacyEscrowAddress,
    escrow: legacyEscrow,
  },
  {
    index: 2,
    vaultAddress: legacyVault2Address,
    vault: legacyVault2,
    escrowAddress: legacyEscrow2Address,
    escrow: legacyEscrow2,
  },
];

export { LEGACY_ESCROW_STATE };

/// Auto-getter shape on the legacy escrow. Same tuple as before but without
/// milestonePcts (the dynamic array is dropped by Solidity's auto-getter).
export interface LegacyEscrowAccount {
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

async function readEscrowFrom(
  contract: NonNullable<typeof legacyEscrow>,
  jobId: string,
): Promise<LegacyEscrowAccount | null> {
  try {
    const raw = (await contract.read.escrows([jobId as `0x${string}`])) as readonly [
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
    return {
      buyer: raw[0],
      seller: raw[1],
      dealAmount: raw[2],
      sellerNet: raw[3],
      feeTotal: raw[4],
      released: raw[5],
      feeReleased: raw[6],
      milestonesReleased: raw[7],
      state: raw[8],
    };
  } catch {
    return null;
  }
}

/// Read the escrow account for jobId across every configured legacy generation.
/// Returns the first generation that recognises the jobId (state != None). A
/// jobId only ever lives on one legacy escrow, so the first hit wins.
export async function readLegacyEscrow(jobId: string): Promise<LegacyEscrowAccount | null> {
  for (const gen of legacyGenerations) {
    if (!gen.escrow) continue;
    const result = await readEscrowFrom(gen.escrow, jobId);
    if (result && result.state !== LEGACY_ESCROW_STATE.None) {
      return result;
    }
  }
  return null;
}

/// Variant that also tells the caller which generation matched. Used by the
/// legacy routes when they need to route a write call to the right escrow.
export async function readLegacyEscrowWithGen(
  jobId: string,
): Promise<{ account: LegacyEscrowAccount; generation: 1 | 2 } | null> {
  for (const gen of legacyGenerations) {
    if (!gen.escrow) continue;
    const result = await readEscrowFrom(gen.escrow, jobId);
    if (result && result.state !== LEGACY_ESCROW_STATE.None) {
      return { account: result, generation: gen.index };
    }
  }
  return null;
}

export const usdc = required('USDC_ADDR', config.USDC_ADDR);
export const identityRegistry = required('IDENTITY_REGISTRY_ADDR', config.IDENTITY_REGISTRY_ADDR);

/// EscrowState enum from KarwanEscrow v2.D:
///   None=0, Funded=1, Accepted=2, Settled=3, Disputed=4, Refunded=5
export const ESCROW_STATE = {
  None: 0,
  Funded: 1,
  Accepted: 2,
  Settled: 3,
  Disputed: 4,
  Refunded: 5,
} as const;

export interface EscrowAccount {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  dealAmount: bigint;
  sellerNet: bigint;
  feeTotal: bigint;
  released: bigint;
  feeReleased: bigint;
  /// Amount reserved on the vault against this jobId. 0 until acceptEscrow.
  /// Doubles as the "was-Accepted" sentinel for the refund / dispute paths.
  reservedAmount: bigint;
  milestonePcts: number[];
  milestonesReleased: number;
  state: number;
}

// feeBps and reservationBps are immutable on the escrow contract; cache safe.
let _feeBpsCache: number | null = null;
let _reservationBpsCache: number | null = null;

export async function getEscrowFeeBps(): Promise<number> {
  if (_feeBpsCache === null) {
    _feeBpsCache = Number(await escrow.read.feeBps());
  }
  return _feeBpsCache;
}

export async function getReservationBps(): Promise<number> {
  if (_reservationBpsCache === null) {
    _reservationBpsCache = Number(await escrow.read.reservationBps());
  }
  return _reservationBpsCache;
}

export interface FundingBreakdown {
  feeTotal: bigint;
  buyerFee: bigint;
  sellerFee: bigint;
  sellerNet: bigint;
  fundedAmount: bigint;
}

/// Mirrors KarwanEscrow.fundEscrow math.
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

/// Computes the vault reservation that acceptEscrow will lock against the
/// seller's free stake. dealAmountWei × reservationBps / 10000.
export function computeReservation(dealAmountWei: bigint, reservationBps: number): bigint {
  return (dealAmountWei * BigInt(reservationBps)) / 10000n;
}

/// Reads the escrow record via the explicit getEscrow(jobId) view rather
/// than the public-mapping auto-getter, which silently drops the
/// milestonePcts dynamic array (audit M-3). The explicit view returns the
/// full struct in one call.
///
/// Cached with a short TTL because /api/deals/feed enrich()s up to 60
/// deals per request. SSE-driven UIs refresh themselves on relevant
/// events, so a 10s staleness window is invisible in practice.
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
  const raw = (await escrow.read.getEscrow([jobId as `0x${string}`])) as {
    buyer: `0x${string}`;
    seller: `0x${string}`;
    dealAmount: bigint;
    sellerNet: bigint;
    feeTotal: bigint;
    released: bigint;
    feeReleased: bigint;
    reservedAmount: bigint;
    milestonePcts: readonly number[];
    milestonesReleased: number;
    state: number;
  };
  const value: EscrowAccount = {
    buyer: raw.buyer,
    seller: raw.seller,
    dealAmount: raw.dealAmount,
    sellerNet: raw.sellerNet,
    feeTotal: raw.feeTotal,
    released: raw.released,
    feeReleased: raw.feeReleased,
    reservedAmount: raw.reservedAmount,
    milestonePcts: [...raw.milestonePcts],
    milestonesReleased: raw.milestonesReleased,
    state: raw.state,
  };
  escrowCache.set(key, { value, expiresAt: now + READ_ESCROW_TTL_MS });
  return value;
}

const erc20BalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/// Reads an address's USDC balance on Arc. Used to preflight escrow
/// funding so a Circle SCA's inner transferFrom doesn't silently revert
/// inside a successful handleOps wrapper.
export async function readUsdcBalance(owner: string): Promise<bigint> {
  return (await publicClient.readContract({
    address: usdc,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [owner as `0x${string}`],
  })) as bigint;
}
