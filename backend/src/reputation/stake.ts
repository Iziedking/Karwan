/// Vault stake reader for the reputation engine. Wraps the KarwanVault
/// contract once it's deployed; until then it returns zero so the formula
/// degrades gracefully.
///
/// When the indexer lands (with the vault deploy), this module reads each
/// address's active positions, computes the tenure weight per position, and
/// returns the sum. Math per docs/reputation-model.md §3:
///
///   tenureWeightedStakeUsdc = Σ principal × min(1, tenureDays / 365)
///
/// Cached per-address with a short TTL so repeated reputation reads in the
/// same page render don't re-hit chain.

import { config } from '../config.js';
import { logger } from '../logger.js';

interface CacheEntry {
  value: number;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

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
    // Vault not deployed yet. The reputation formula handles a 0 stake
    // gracefully (stakeTerm caps at 1.0, no boost), so this is a clean
    // degradation rather than an error path.
    cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
    return 0;
  }

  try {
    // Indexer integration lands with the vault deploy. The shape is:
    //   1. read user's active positionIds from a backend table that listens
    //      to Deposited / WithdrawalRequested / WithdrawalCancelled / Claimed
    //      events;
    //   2. for each active position, call activePrincipal + tenureSeconds on
    //      the vault contract;
    //   3. sum principal × min(1, tenureDays / 365).
    // For now we return 0 + log once so the integration point is obvious.
    if (!warned.has(vaultAddr)) {
      warned.add(vaultAddr);
      logger.info(
        { vault: vaultAddr },
        'KarwanVault address set but indexer not wired yet; stakeTerm fixed at 0',
      );
    }
    cache.set(address, { value: 0, expiresAt: Date.now() + CACHE_TTL_MS });
    return 0;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, address },
      'vault stake read failed, defaulting to zero',
    );
    return 0;
  }
}

const warned = new Set<string>();
