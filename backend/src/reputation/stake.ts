/// Vault stake reader for the reputation engine. v2.D rewrite:
///
///   1. Enumerates positions by `positionId` 1..nextPositionId via multicall
///      instead of paginating `Deposited` event logs. Eliminates the silent
///      RPC log-drop bug that caused the credit-passport to read fewer
///      positions than the chain actually held (#212).
///   2. Reads BOTH the active vault and the legacy vault (KARWAN_VAULT_ADDR
///      and optional KARWAN_VAULT_LEGACY_ADDR), summing principals so
///      existing stakers keep their tenure during the migration window.
///   3. Uses the new `freeStakeOf(owner)` view on the active vault for the
///      reputation stake term, so insurance reservations don't double-count
///      against the stake signal.
///
/// Math per docs/reputation-model.md §3:
///
///   tenureWeightedStakeUsdc = Σ principal × min(1, tenureDays / 365)
///
/// Cached per-address with a short TTL so repeated reputation reads in the
/// same page render don't re-hit chain.

import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { vault, legacyVault } from '../chain/contracts.js';
import { vaultAbi } from '../chain/abis/vault.js';
import { legacyVaultAbi } from '../chain/abis/legacyVault.js';
import { logger } from '../logger.js';

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const USDC_DECIMALS = 6;
const SECONDS_PER_DAY = 86_400;
const TENURE_CAP_DAYS = 365;
const cache = new Map<string, CacheEntry>();
const warned = new Set<string>();

/// KarwanVault.sol position enum: { None=0, Active=1, Cooling=2, Withdrawn=3 }.
const POSITION_STATE_ACTIVE = 1;

interface PositionView {
  owner: `0x${string}`;
  principal: bigint;
  depositedAt: bigint;
  cooldownStartedAt: bigint;
  claimableAt: bigint;
  state: number;
}

/// Read every position owned by `owner` on the given vault. For the active
/// (v2.D) vault, walks positionId 1..nextPositionId via multicall. For the
/// legacy (pre-v2.D) vault, falls back to scanning Deposited events filtered
/// by the owner topic, because the older contract has no nextPositionId
/// view. Both paths converge on the same positionView shape downstream.
async function readPositionsForOwner(
  vaultAddress: `0x${string}`,
  owner: string,
  isLegacy = false,
): Promise<PositionView[]> {
  if (isLegacy) return readLegacyPositions(vaultAddress, owner);
  // Treat zero-address vault as "no positions"; happens during transition
  // when KARWAN_VAULT_LEGACY_ADDR is unset.
  if (!vaultAddress) return [];

  let nextId: bigint;
  try {
    nextId = (await publicClient.readContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: 'nextPositionId',
    })) as bigint;
  } catch (err) {
    if (!warned.has(vaultAddress)) {
      warned.add(vaultAddress);
      logger.warn(
        { err: (err as Error).message, vault: vaultAddress },
        'nextPositionId read failed, treating as empty vault (logged once per vault)',
      );
    }
    return [];
  }

  if (nextId <= 1n) return [];

  // Arc Testnet has no Multicall3 contract, so viem's `multicall()` throws.
  // Promise.allSettled with N individual reads (N capped by nextPositionId,
  // typically under 50 for testnet) is portable and the round-trip cost is
  // negligible at this scale.
  const ids: bigint[] = [];
  for (let i = 1n; i < nextId; i++) ids.push(i);

  const results = await Promise.allSettled(
    ids.map((id) =>
      publicClient.readContract({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'positions',
        args: [id],
      }),
    ),
  );

  const ownerLower = owner.toLowerCase();
  const out: PositionView[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const tuple = r.value as readonly [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
    ];
    if (tuple[0].toLowerCase() !== ownerLower) continue;
    out.push({
      owner: tuple[0],
      principal: tuple[1],
      depositedAt: tuple[2],
      cooldownStartedAt: tuple[3],
      claimableAt: tuple[4],
      state: tuple[5],
    });
  }
  return out;
}

/// Returns the tenure-weighted active stake for an address, summed across
/// the active vault and (when configured) the legacy vault. Returns 0 when
/// no vault is configured. Never throws.
export async function tenureWeightedStakeUsdc(addressRaw: string): Promise<number> {
  const address = addressRaw.toLowerCase();
  const cached = cache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const vaultAddr = (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_ADDR;
  if (!vaultAddr) {
    cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
    return 0;
  }

  const legacyAddr = (config as unknown as Record<string, string | undefined>)
    .KARWAN_VAULT_LEGACY_ADDR;

  const [activePositions, legacyPositions] = await Promise.all([
    readPositionsForOwner(vaultAddr as `0x${string}`, address, false),
    legacyAddr
      ? readPositionsForOwner(legacyAddr as `0x${string}`, address, true)
      : Promise.resolve([] as PositionView[]),
  ]);

  const now = Math.floor(Date.now() / 1000);
  let totalWeighted = 0;
  for (const p of [...activePositions, ...legacyPositions]) {
    if (p.state !== POSITION_STATE_ACTIVE) continue;
    if (p.principal === 0n) continue;
    const tenureDays = Math.max(0, (now - Number(p.depositedAt)) / SECONDS_PER_DAY);
    const tenureWeight = Math.min(1, tenureDays / TENURE_CAP_DAYS);
    const principalUsdc = Number(formatUnits(p.principal, USDC_DECIMALS));
    totalWeighted += principalUsdc * tenureWeight;
  }

  cache.set(address, { value: totalWeighted, expiresAt: Date.now() + CACHE_TTL_MS });
  return totalWeighted;
}

export interface ActiveStakeSummary {
  /// Sum of active position principals across both vaults, in USDC. The
  /// reputation engine's stake factor pre-v2.D used this directly. v2.D's
  /// stake factor uses freeStakeUsdc (active minus reservations on the new
  /// vault) so insurance reservations don't double-count.
  stakeUsdc: number;
  /// Active minus open reservations on the v2.D vault. Same units as
  /// stakeUsdc. Legacy-vault positions count as fully free (the legacy
  /// vault has no reservation system).
  freeStakeUsdc: number;
  /// Sum of open reservation amounts on the v2.D vault for this owner.
  reservedUsdc: number;
  /// Longest-held active position's age in days across both vaults.
  /// Drives the stake duration ramp.
  stakeDays: number;
}

const summaryCache = new Map<string, { value: ActiveStakeSummary; expiresAt: number }>();
const EMPTY_SUMMARY: ActiveStakeSummary = {
  stakeUsdc: 0,
  freeStakeUsdc: 0,
  reservedUsdc: 0,
  stakeDays: 0,
};

/// Raw active stake + reservation + staking duration for the reputation
/// engine. Unlike tenureWeightedStakeUsdc (which divides by 365 and makes
/// days-old stake worth ~1%), this returns the real staked amount and the
/// duration separately so the engine can credit staking immediately and
/// ramp it over a short window.
export async function activeStakeSummary(addressRaw: string): Promise<ActiveStakeSummary> {
  const address = addressRaw.toLowerCase();
  const cached = summaryCache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const vaultAddr = (config as unknown as Record<string, string | undefined>).KARWAN_VAULT_ADDR;
  if (!vaultAddr) {
    summaryCache.set(address, { value: EMPTY_SUMMARY, expiresAt: Date.now() + CACHE_TTL_MS });
    return EMPTY_SUMMARY;
  }

  const legacyAddr = (config as unknown as Record<string, string | undefined>)
    .KARWAN_VAULT_LEGACY_ADDR;

  const [activePositions, legacyPositions, reservedRaw] = await Promise.all([
    readPositionsForOwner(vaultAddr as `0x${string}`, address, false),
    legacyAddr
      ? readPositionsForOwner(legacyAddr as `0x${string}`, address, true)
      : Promise.resolve([] as PositionView[]),
    vault.read.reservedTotal([address as `0x${string}`]).catch(() => 0n),
  ]);

  const now = Math.floor(Date.now() / 1000);
  let stakeUsdc = 0;
  let stakeDays = 0;
  for (const p of [...activePositions, ...legacyPositions]) {
    if (p.state !== POSITION_STATE_ACTIVE) continue;
    if (p.principal === 0n) continue;
    stakeUsdc += Number(formatUnits(p.principal, USDC_DECIMALS));
    const days = Math.max(0, (now - Number(p.depositedAt)) / SECONDS_PER_DAY);
    if (days > stakeDays) stakeDays = days;
  }

  const reservedUsdc = Number(formatUnits(reservedRaw as bigint, USDC_DECIMALS));
  const freeStakeUsdc = Math.max(0, stakeUsdc - reservedUsdc);

  const value: ActiveStakeSummary = {
    stakeUsdc,
    freeStakeUsdc,
    reservedUsdc,
    stakeDays,
  };
  summaryCache.set(address, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/// Suppresses callers from referencing the legacy vault directly. Used by
/// the migration-aware bits of the frontend stake page so it knows whether
/// to render a "Legacy positions are still earning tenure" badge.
export function hasLegacyVault(): boolean {
  return legacyVault !== null;
}

/// Reads positions for `owner` on the pre-v2.D vault by enumerating every
/// position from 0 to nextPositionId via multicall, then filtering in
/// memory. The legacy contract lacks activeStakeOf but does expose the
/// nextPositionId counter and positions() view; verified by hand against
/// the deployed contract.
async function readLegacyPositions(
  vaultAddress: `0x${string}`,
  owner: string,
): Promise<PositionView[]> {
  let nextId: bigint;
  try {
    nextId = (await publicClient.readContract({
      address: vaultAddress,
      abi: legacyVaultAbi,
      functionName: 'nextPositionId',
    })) as bigint;
  } catch (err) {
    if (!warned.has(vaultAddress)) {
      warned.add(vaultAddress);
      logger.warn(
        { err: (err as Error).message, vault: vaultAddress },
        'legacy nextPositionId read failed (logged once per vault)',
      );
    }
    return [];
  }

  if (nextId === 0n) return [];

  const ids: bigint[] = [];
  for (let i = 0n; i <= nextId; i++) ids.push(i);

  const results = await Promise.allSettled(
    ids.map((id) =>
      publicClient.readContract({
        address: vaultAddress,
        abi: legacyVaultAbi,
        functionName: 'positions',
        args: [id],
      }),
    ),
  );

  const ownerLower = owner.toLowerCase();
  const out: PositionView[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const tuple = r.value as readonly [
      `0x${string}`,
      bigint,
      bigint,
      bigint,
      bigint,
      number,
    ];
    if (tuple[0].toLowerCase() !== ownerLower) continue;
    out.push({
      owner: tuple[0],
      principal: tuple[1],
      depositedAt: tuple[2],
      cooldownStartedAt: tuple[3],
      claimableAt: tuple[4],
      state: tuple[5],
    });
  }
  return out;
}
