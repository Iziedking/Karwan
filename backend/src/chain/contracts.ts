import { getContract, parseEventLogs, type Address } from 'viem';
import { config } from '../config.js';
import { ARC, publicClient } from './client.js';
import { jobBoardAbi } from './abis/jobBoard.js';
import { escrowAbi } from './abis/escrow.js';
import { reputationAbi } from './abis/reputation.js';
import { vaultAbi } from './abis/vault.js';
import { escrowV2Abi } from './abis/escrowV2.js';
import { vaultV2Abi } from './abis/vaultV2.js';
import { reputationV2Abi } from './abis/reputationV2.js';
import { jobBoardV2Abi } from './abis/jobBoardV2.js';
import { dealEscrowV3Abi } from './abis/dealEscrowV3.js';
import { dealEscrowV3Address, v3FundingEnabled } from './dealEscrowV3Live.js';
import { readEscrowFeeBps } from './escrowFee.js';

/// Contracts-v2 cutover: when ESCROW_V2B_ENABLED is on (and KARWAN_*_ADDR point
/// at the v2 bundle), the backend binds the v2 ABIs so it can decode the new
/// escrow struct + call the new functions. Off (default) it keeps the current
/// ABIs against the live contracts. The flag, the addresses, and this selection
/// must flip together at the atomic redeploy. Cast to Abi so the ternary yields
/// one type; the read return shapes are cast explicitly at each call site.
const V2 = config.ESCROW_V2B_ENABLED;
// Type against the v2 ABI shape (a superset) so viem keeps typed read methods;
// the runtime value is the correct ABI for the deployed contract. The backend
// only ever reads methods present in BOTH versions, so this is sound.
const activeEscrowAbi = (V2 ? escrowV2Abi : escrowAbi) as typeof escrowV2Abi;
const activeVaultAbi = (V2 ? vaultV2Abi : vaultAbi) as typeof vaultV2Abi;
const activeReputationAbi = (V2 ? reputationV2Abi : reputationAbi) as typeof reputationV2Abi;
const activeJobBoardAbi = (V2 ? jobBoardV2Abi : jobBoardAbi) as typeof jobBoardV2Abi;

function required(name: string, value: string | undefined): Address {
  if (!value) throw new Error(`${name} is not set in .env`);
  return value as Address;
}

const CORE_ADDRS = {
  KARWAN_JOBBOARD_ADDR: config.KARWAN_JOBBOARD_ADDR,
  KARWAN_ESCROW_ADDR: config.KARWAN_ESCROW_ADDR,
  KARWAN_REPUTATION_ADDR: config.KARWAN_REPUTATION_ADDR,
  KARWAN_VAULT_ADDR: config.KARWAN_VAULT_ADDR,
};
const coreSet = Object.values(CORE_ADDRS).filter(Boolean).length;

/// Whether Karwan's own contracts exist on the active network. Mainnet runs
/// wallet-only (balances, deposits, bridging) until the suite is deployed there,
/// so it may leave all four unset. Testnet, or a half-set list anywhere, is a
/// misconfiguration and stops the process as it always has.
export const KARWAN_CONTRACTS_DEPLOYED = coreSet === Object.keys(CORE_ADDRS).length;
if (!KARWAN_CONTRACTS_DEPLOYED && (ARC.testnet || coreSet > 0)) {
  const missing = Object.entries(CORE_ADDRS).find(([, v]) => !v)?.[0];
  throw new Error(`${missing} is not set in .env`);
}

/// Stand-in for a contract that is not deployed on this network. Importing it
/// is harmless; using it throws, so a deal path that slips past the route and
/// worker gates fails closed instead of calling address zero.
function notDeployed<T>(name: string): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then' || typeof prop === 'symbol') return undefined;
        throw new Error(`${name} is not deployed on Arc ${ARC.name}`);
      },
    },
  ) as T;
}

function core<T>(name: keyof typeof CORE_ADDRS, bind: (address: Address) => T): T {
  return KARWAN_CONTRACTS_DEPLOYED ? bind(CORE_ADDRS[name] as Address) : notDeployed<T>(name);
}

function optional(value: string | undefined): Address | null {
  if (!value) return null;
  return value as Address;
}

export const jobBoard = core('KARWAN_JOBBOARD_ADDR', (address) =>
  getContract({ address, abi: activeJobBoardAbi, client: publicClient }),
);

export const escrow = core('KARWAN_ESCROW_ADDR', (address) =>
  getContract({ address, abi: activeEscrowAbi, client: publicClient }),
);

export const reputation = core('KARWAN_REPUTATION_ADDR', (address) =>
  getContract({ address, abi: activeReputationAbi, client: publicClient }),
);

/// Active KarwanVault (v2.D bundle). Holds stake positions, runs the
/// insurance reservation system, and is the source of truth for the
/// stake factor in the reputation engine.
export const vault = core('KARWAN_VAULT_ADDR', (address) =>
  getContract({ address, abi: activeVaultAbi, client: publicClient }),
);

/// Older vaults and escrows configured by setting. The reputation tenure reader
/// and the historical event scan still read them; recovery reads every older
/// contract from the deploy ledger instead (chain/legacyLive.ts, view 37).
const legacySetting = (name: string) => optional((config as unknown as Record<string, string | undefined>)[name]);

export const legacyVaultAddress: Address | null = legacySetting('KARWAN_VAULT_LEGACY_ADDR');
export const legacyVault = legacyVaultAddress
  ? getContract({ address: legacyVaultAddress, abi: vaultAbi, client: publicClient })
  : null;
export const legacyEscrowAddress: Address | null = legacySetting('KARWAN_ESCROW_LEGACY_ADDR');
export const legacyEscrow2Address: Address | null = legacySetting('KARWAN_ESCROW_LEGACY_ADDR_2');
export const legacyEscrow3Address: Address | null = legacySetting('KARWAN_ESCROW_LEGACY_ADDR_3');

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
  /// v2b delivery lifecycle: deliveredAt is set by markDelivered (0 = nothing
  /// pending review); claimDeadline is when the seller may claim the current
  /// milestone. Undefined on the v2.E ABI. Surfaced to the UI so the claim
  /// button gates on the on-chain clock, not the off-chain one (R4).
  deliveredAt?: bigint;
  claimDeadline?: bigint;
  wasAccepted?: boolean;
}

// maxReservationBps is immutable; cache forever. feeBps became OWNER-SETTABLE in
// v2 (adjustable base fee), so it gets a short TTL instead of a permanent cache
// — a fee change must reflect in funding math within the window, and each deal
// snapshots its fee on chain at fund time regardless.
let _reservationBpsCache: number | null = null;
const FEE_BPS_TTL_MS = 60_000;
let _feeBpsCache: { value: number; expiresAt: number } | null = null;

export async function getEscrowFeeBps(options?: { fresh?: boolean }): Promise<number> {
  const now = Date.now();
  if (!options?.fresh && _feeBpsCache && _feeBpsCache.expiresAt > now) {
    return _feeBpsCache.value;
  }
  const value = await readEscrowFeeBps({
    v3Funding: v3FundingEnabled(),
    readV3: () =>
      publicClient.readContract({ address: dealEscrowV3Address as Address, abi: dealEscrowV3Abi, functionName: 'feeBps' }) as Promise<bigint | number>,
    readLegacy: () => escrow.read.feeBps(),
  });
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
    deliveredAt?: bigint;
    claimDeadline?: bigint;
    wasAccepted?: boolean;
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
    deliveredAt: raw.deliveredAt,
    claimDeadline: raw.claimDeadline,
    wasAccepted: raw.wasAccepted,
  };
  escrowCache.set(key, { value, expiresAt: now + READ_ESCROW_TTL_MS });
  return value;
}

const erc20ReadAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/// The jobId the JobBoard actually emitted for a postJob tx, read from the
/// JobPosted event in the receipt. This is the ONLY source of truth for the id:
/// the contract derives jobId = keccak256(msg.sender, salt) from the real Circle
/// SCA that signs, while the backend derives it off-chain from the STORED buyer
/// agent address. When that stored address has drifted from the real signer the
/// two disagree, so the derived id points at a job that never existed while the
/// real job posts under a different id (the buyer is stranded on a 404). It also
/// catches a genuine inner revert: Circle reports the tx COMPLETE when the outer
/// handleOps lands even if the inner postJob reverted, in which case no
/// JobPosted event is present. Returns null on no-event (revert) or an
/// unreadable receipt after a few tries. See erc4337-inner-revert +
/// own-auction-misfire notes.
export async function readPostedJobId(txHash: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      const parsed = parseEventLogs({
        abi: activeJobBoardAbi,
        eventName: 'JobPosted',
        logs: receipt.logs,
      });
      const jobId = (parsed[0]?.args as { jobId?: string } | undefined)?.jobId;
      return jobId ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

/// Reads an address's USDC balance on Arc. Used to preflight escrow
/// funding so a Circle SCA's inner transferFrom doesn't silently revert
/// inside a successful handleOps wrapper.
export async function readUsdcBalance(owner: string): Promise<bigint> {
  return (await publicClient.readContract({
    address: usdc,
    abi: erc20ReadAbi,
    functionName: 'balanceOf',
    args: [owner as `0x${string}`],
  })) as bigint;
}

/// Reads the exact ERC-20 allowance. Circle COMPLETE and a successful outer
/// ERC-4337 receipt are not enough to prove the inner approve call changed
/// token state, so escrow funding verifies this before fundEscrow.
export async function readUsdcAllowance(owner: string, spender: string): Promise<bigint> {
  return (await publicClient.readContract({
    address: usdc,
    abi: erc20ReadAbi,
    functionName: 'allowance',
    args: [owner as `0x${string}`, spender as `0x${string}`],
  })) as bigint;
}
