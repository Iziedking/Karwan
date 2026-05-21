/// Vault stake reader for the reputation engine. Reads KarwanVault directly
/// via viem when `KARWAN_VAULT_ADDR` is set; degrades cleanly to 0 when the
/// vault is not deployed (early testnet phase). Math per
/// docs/reputation-model.md §3:
///
///   tenureWeightedStakeUsdc = Σ principal × min(1, tenureDays / 365)
///
/// Cached per-address with a short TTL so repeated reputation reads in the
/// same page render don't re-hit chain.
///
/// Strategy: enumerate the address's `Deposited` events on the vault to find
/// every positionId they own (the vault has no positionsByOwner mapping, so
/// the event log is the cheapest enumeration). For each one, call
/// `positions(id)` to read its current state + principal + depositedAt, then
/// keep only Active positions. Cooling positions earn no stake credit (the
/// spec treats withdrawal-cooldown as "stake forfeited until you cancel").

import { formatUnits } from 'viem';
import { config } from '../config.js';
import { publicClient } from '../chain/client.js';
import { fetchDepositedLogsForOwner } from '../chain/vaultLogs.js';
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

/// KarwanVault.sol declares the position enum as
/// `{ None=0, Active=1, Cooling=2, Withdrawn=3 }`. Stake credit only applies
/// to Active positions; cooling principal is paused for fraud-check window.
const POSITION_STATE_ACTIVE = 1;

/// Minimal vault ABI: `positions(uint256)` so we can read state without
/// dragging the whole contract ABI into the backend. The Deposited event
/// enumeration is owned by `chain/vaultLogs.ts` so the same paginated reader
/// powers both the positions endpoint and the reputation stake term.
const vaultPositionsAbi = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'principal', type: 'uint256' },
      { name: 'depositedAt', type: 'uint64' },
      { name: 'cooldownStartedAt', type: 'uint64' },
      { name: 'claimableAt', type: 'uint64' },
      { name: 'state', type: 'uint8' },
    ],
  },
] as const;

/// Returns the tenure-weighted active stake for an address. Returns 0 when
/// the vault is not configured. Never throws — the engine treats a failed
/// stake read as zero rather than as an error, so a vault outage doesn't
/// take down reputation reads.
export async function tenureWeightedStakeUsdc(addressRaw: string): Promise<number> {
  const address = addressRaw.toLowerCase();
  const cached = cache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const vaultAddr = (
    config as unknown as Record<string, string | undefined>
  ).KARWAN_VAULT_ADDR;
  if (!vaultAddr) {
    cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
    return 0;
  }

  try {
    // Paginated read covers the vault's full deployed history rather than
    // only the last ~5h that the previous `latest - 9500` anchor surfaced.
    const logs = await fetchDepositedLogsForOwner(vaultAddr as `0x${string}`, address);

    if (logs.length === 0) {
      cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    let totalWeighted = 0;

    for (const log of logs) {
      const position = (await publicClient.readContract({
        address: vaultAddr as `0x${string}`,
        abi: vaultPositionsAbi,
        functionName: 'positions',
        args: [log.positionId],
      })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
      const [, principal, depositedAt, , , state] = position;
      if (state !== POSITION_STATE_ACTIVE) continue;
      if (principal === 0n) continue;
      const tenureDays = Math.max(0, (now - Number(depositedAt)) / SECONDS_PER_DAY);
      const tenureWeight = Math.min(1, tenureDays / TENURE_CAP_DAYS);
      const principalUsdc = Number(formatUnits(principal, USDC_DECIMALS));
      totalWeighted += principalUsdc * tenureWeight;
    }

    cache.set(address, { value: totalWeighted, expiresAt: Date.now() + CACHE_TTL_MS });
    return totalWeighted;
  } catch (err) {
    if (!warned.has(vaultAddr)) {
      warned.add(vaultAddr);
      logger.warn(
        { err: (err as Error).message, vault: vaultAddr, address },
        'vault stake read failed, defaulting to zero (logged once per vault)',
      );
    }
    return 0;
  }
}

export interface ActiveStakeSummary {
  /// Sum of active position principals, in USDC (raw, not tenure-divided).
  stakeUsdc: number;
  /// Longest-held active position's age in days. "how long you've been staking"
  /// for the reputation duration envelope. 0 when nothing is staked.
  stakeDays: number;
}

const summaryCache = new Map<string, { value: ActiveStakeSummary; expiresAt: number }>();

/// Raw active stake + staking duration for the reputation engine v2. Unlike
/// tenureWeightedStakeUsdc (which divides by 365 and makes days-old stake worth
/// ~1%), this returns the real staked amount and the duration separately so the
/// engine can credit staking immediately and ramp it over a short window.
export async function activeStakeSummary(addressRaw: string): Promise<ActiveStakeSummary> {
  const address = addressRaw.toLowerCase();
  const cached = summaryCache.get(address);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const empty: ActiveStakeSummary = { stakeUsdc: 0, stakeDays: 0 };
  const vaultAddr = (config as unknown as Record<string, string | undefined>)
    .KARWAN_VAULT_ADDR;
  if (!vaultAddr) {
    summaryCache.set(address, { value: empty, expiresAt: Date.now() + CACHE_TTL_MS });
    return empty;
  }

  try {
    const logs = await fetchDepositedLogsForOwner(vaultAddr as `0x${string}`, address);
    if (logs.length === 0) {
      summaryCache.set(address, { value: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      return empty;
    }
    const now = Math.floor(Date.now() / 1000);
    let stakeUsdc = 0;
    let stakeDays = 0;
    for (const log of logs) {
      const position = (await publicClient.readContract({
        address: vaultAddr as `0x${string}`,
        abi: vaultPositionsAbi,
        functionName: 'positions',
        args: [log.positionId],
      })) as readonly [`0x${string}`, bigint, bigint, bigint, bigint, number];
      const [, principal, depositedAt, , , state] = position;
      if (state !== POSITION_STATE_ACTIVE || principal === 0n) continue;
      stakeUsdc += Number(formatUnits(principal, USDC_DECIMALS));
      const days = Math.max(0, (now - Number(depositedAt)) / SECONDS_PER_DAY);
      if (days > stakeDays) stakeDays = days;
    }
    const value: ActiveStakeSummary = { stakeUsdc, stakeDays };
    summaryCache.set(address, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (err) {
    if (!warned.has(vaultAddr)) {
      warned.add(vaultAddr);
      logger.warn(
        { err: (err as Error).message, vault: vaultAddr, address },
        'vault stake summary read failed, defaulting to zero (logged once per vault)',
      );
    }
    return empty;
  }
}
