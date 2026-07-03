import { getContract, type Address } from 'viem';
import { config } from '../config.js';
import { publicClient } from './client.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';
import { vaultAbi } from './abis/vault.js';
import { legacyEscrowAbi, LEGACY_ESCROW_STATE } from './abis/legacyEscrow.js';
import { v2dEscrowAbi, V2D_ESCROW_STATE } from './abis/v2dEscrow.js';

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

/// Third-generation legacy KarwanVault, the v2.D vault that v2.E displaces.
/// Same ABI as the active vault (vaultAbi) since the v2.D vault already had
/// the agentOwner mapping + position struct that v2.E inherits.
export const legacyVault3Address: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_LEGACY_ADDR_3,
);

export const legacyVault3 = legacyVault3Address
  ? getContract({ address: legacyVault3Address, abi: vaultAbi, client: publicClient })
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

/// Third-generation legacy KarwanEscrow, the v2.D escrow. Uses the v2.D
/// ABI which has an extra `reservedAmount` field in the auto-getter tuple.
/// The reader in readEscrowFrom branches on `kind` to pick the right ABI
/// + state-enum mapping.
export const legacyEscrow3Address: Address | null = optional(
  (config as unknown as Record<string, string | undefined>).KARWAN_ESCROW_LEGACY_ADDR_3,
);

export const legacyEscrow3 = legacyEscrow3Address
  ? getContract({ address: legacyEscrow3Address, abi: v2dEscrowAbi, client: publicClient })
  : null;

/// Per-generation registry. Each entry binds a generation number to its
/// vault + escrow addresses. Gen 3 uses the v2.D ABI shape (one extra
/// storage field in the auto-getter tuple) and a different state-enum
/// mapping; the `kind` discriminator drives both at read time.
export type LegacyEscrowKind = 'pre-v2d' | 'v2d';

export interface LegacyGeneration {
  index: 1 | 2 | 3;
  /// Vault uses the current vaultAbi for every generation. The v2.D
  /// vault already shared this surface so a single ABI covers all three.
  vaultAddress: Address | null;
  vault: typeof legacyVault;
  /// Escrow ABI differs by generation. Gen 1 + Gen 2 use the pre-v2.D ABI;
  /// Gen 3 uses the v2.D ABI (the readEscrowFrom helper branches on kind).
  kind: LegacyEscrowKind;
  escrowAddress: Address | null;
  escrow: typeof legacyEscrow | typeof legacyEscrow3;
}

export const legacyGenerations: LegacyGeneration[] = [
  {
    index: 1,
    vaultAddress: legacyVaultAddress,
    vault: legacyVault,
    kind: 'pre-v2d',
    escrowAddress: legacyEscrowAddress,
    escrow: legacyEscrow,
  },
  {
    index: 2,
    vaultAddress: legacyVault2Address,
    vault: legacyVault2,
    kind: 'pre-v2d',
    escrowAddress: legacyEscrow2Address,
    escrow: legacyEscrow2,
  },
  {
    index: 3,
    vaultAddress: legacyVault3Address,
    vault: legacyVault3,
    kind: 'v2d',
    escrowAddress: legacyEscrow3Address,
    escrow: legacyEscrow3,
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

/// Map v2.D state enum values to the pre-v2.D legacy enum shape so downstream
/// code that gates on LEGACY_ESCROW_STATE keeps working regardless of source
/// generation. v2.D adds an Accepted state between Funded and Settled; for
/// recovery purposes "Accepted" is just "still funded, waiting on a release",
/// which collapses to Funded in the legacy state machine.
function mapV2dStateToLegacy(v2dState: number): number {
  switch (v2dState) {
    case V2D_ESCROW_STATE.None:
      return LEGACY_ESCROW_STATE.None;
    case V2D_ESCROW_STATE.Funded:
    case V2D_ESCROW_STATE.Accepted:
      return LEGACY_ESCROW_STATE.Funded;
    case V2D_ESCROW_STATE.Settled:
      return LEGACY_ESCROW_STATE.Settled;
    case V2D_ESCROW_STATE.Disputed:
      return LEGACY_ESCROW_STATE.Disputed;
    case V2D_ESCROW_STATE.Refunded:
      return LEGACY_ESCROW_STATE.Refunded;
    default:
      return LEGACY_ESCROW_STATE.None;
  }
}

async function readEscrowFrom(
  gen: LegacyGeneration,
  jobId: string,
): Promise<LegacyEscrowAccount | null> {
  if (!gen.escrow) return null;
  try {
    if (gen.kind === 'v2d') {
      // v2.D auto-getter: 10 fields (adds reservedAmount; drops milestonePcts).
      const raw = (await (gen.escrow as NonNullable<typeof legacyEscrow3>).read.escrows([
        jobId as `0x${string}`,
      ])) as readonly [
        `0x${string}`,
        `0x${string}`,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint, // reservedAmount, v2.D only, dropped from the normalised view
        number, // milestonesReleased
        number, // state (v2.D enum)
      ];
      return {
        buyer: raw[0],
        seller: raw[1],
        dealAmount: raw[2],
        sellerNet: raw[3],
        feeTotal: raw[4],
        released: raw[5],
        feeReleased: raw[6],
        milestonesReleased: raw[8],
        state: mapV2dStateToLegacy(raw[9]),
      };
    }
    // Pre-v2.D shape: 9 fields, state already in legacy enum.
    const raw = (await (gen.escrow as NonNullable<typeof legacyEscrow>).read.escrows([
      jobId as `0x${string}`,
    ])) as readonly [
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
    const result = await readEscrowFrom(gen, jobId);
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
): Promise<{ account: LegacyEscrowAccount; generation: 1 | 2 | 3 } | null> {
  for (const gen of legacyGenerations) {
    if (!gen.escrow) continue;
    const result = await readEscrowFrom(gen, jobId);
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
  /// Per-deal stake gate captured at fund time (v2.E+). 0 = casual deal, no
  /// vault.reserve fires on acceptEscrow. 5000..maxReservationBps = trusted
  /// match, that pct of dealAmount must be reserved against the seller's
  /// free stake. Zero on legacy (pre-v2.E) deals since the field didn't exist.
  reservationBps: number;
  /// v2b per-deal clock. undefined against the v2.E ABI (the fields don't
  /// exist on that getEscrow return, so viem never decodes them) and only
  /// populated once abis/escrow.ts is swapped to the v2b shape at cutover.
  /// Consumers must guard on config.ESCROW_V2B_ENABLED before relying on them.
  /// deliveryDeadline / reviewWindow / reclaimGrace / disputedAt are unix
  /// seconds (uint64 on chain); deliveryDeadline 0 = open-ended deal.
  deliveryDeadline?: bigint;
  reviewWindow?: bigint;
  reclaimGrace?: bigint;
  disputedAt?: bigint;
}

// maxReservationBps is immutable; cache forever. feeBps became OWNER-SETTABLE in
// v2 (adjustable base fee), so it gets a short TTL instead of a permanent cache
// — a fee change must reflect in funding math within the window, and each deal
// snapshots its fee on chain at fund time regardless.
let _reservationBpsCache: number | null = null;
const FEE_BPS_TTL_MS = 60_000;
let _feeBpsCache: { value: number; expiresAt: number } | null = null;

export async function getEscrowFeeBps(): Promise<number> {
  const now = Date.now();
  if (_feeBpsCache && _feeBpsCache.expiresAt > now) return _feeBpsCache.value;
  const value = Number(await escrow.read.feeBps());
  _feeBpsCache = { value, expiresAt: now + FEE_BPS_TTL_MS };
  return value;
}

/// Hard ceiling on per-deal reservationBps (v2.E+). Replaces the v2.D
/// protocol-wide `reservationBps()` view. Actual deal gating now uses
/// the per-deal value on EscrowAccount. The ceiling is read once and
/// cached; it's set in the constructor and never changes.
export async function getMaxReservationBps(): Promise<number> {
  if (_reservationBpsCache === null) {
    _reservationBpsCache = Number(
      await escrow.read.maxReservationBps(),
    );
  }
  return _reservationBpsCache;
}

/// Back-compat shim. Pre-v2.E code called this to get the protocol-wide
/// reservation rate; on v2.E it returns the maxReservationBps ceiling
/// instead. Prefer reading account.reservationBps directly from readEscrow.
/// The per-deal value is what acceptEscrow actually enforces.
///
/// @deprecated read account.reservationBps from readEscrow instead.
export async function getReservationBps(): Promise<number> {
  return getMaxReservationBps();
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
    reservationBps: number;
    // v2b-only; absent (undefined) when reading a v2.E getEscrow return.
    deliveryDeadline?: bigint;
    reviewWindow?: bigint;
    reclaimGrace?: bigint;
    disputedAt?: bigint;
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
    reservationBps: raw.reservationBps ?? 0,
    deliveryDeadline: raw.deliveryDeadline,
    reviewWindow: raw.reviewWindow,
    reclaimGrace: raw.reclaimGrace,
    disputedAt: raw.disputedAt,
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
