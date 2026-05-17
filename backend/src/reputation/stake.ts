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

const POSITION_STATE_ACTIVE = 0;

/// Minimal vault ABI: just `Deposited(uint256 indexed positionId, address indexed owner, uint256 principal)`
/// and `positions(uint256)` so we can enumerate + read state without dragging
/// the whole contract ABI into the backend.
const vaultEventAbi = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'positionId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'principal', type: 'uint256', indexed: false },
    ],
  },
] as const;

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
    // Enumerate this address's deposits. Cheap on testnet (few deposits) and
    // bounded on mainnet by the address's own deposit count. For a hot path
    // this would move to an indexer table; for now the chain read is fine
    // because the result is cached for 30s.
    const logs = await publicClient.getLogs({
      address: vaultAddr as `0x${string}`,
      event: vaultEventAbi[0],
      args: { owner: address as `0x${string}` },
      fromBlock: 0n,
      toBlock: 'latest',
    });

    if (logs.length === 0) {
      cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    let totalWeighted = 0;

    for (const log of logs) {
      const positionId = (log as unknown as { args: { positionId: bigint } }).args.positionId;
      const position = (await publicClient.readContract({
        address: vaultAddr as `0x${string}`,
        abi: vaultPositionsAbi,
        functionName: 'positions',
        args: [positionId],
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
