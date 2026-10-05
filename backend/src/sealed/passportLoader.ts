/// Loads a person's public passport from their profile, deals and reputation.
/// Kept apart from `passport.ts` so the pure rules can be tested without a
/// database or chain connection, the same split as trustCard / loadTrustCard.

import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { compute } from '../reputation/engine.js';
import { loadInputs } from '../reputation/signals.js';
import { buildPassport, sealedFactsFor, type PublicPassport } from './passport.js';

const PASSPORT_CACHE_TTL_MS = 45_000;
const PASSPORT_CACHE_MAX = 1000;
const passportCache = new Map<string, { value: PublicPassport; at: number }>();

export async function loadPublicPassport(address: string): Promise<PublicPassport> {
  const key = address.toLowerCase();
  const now = Date.now();
  const hit = passportCache.get(key);
  if (hit && now - hit.at < PASSPORT_CACHE_TTL_MS) return hit.value;

  const [profile, deals, inputs] = await Promise.all([
    getProfile(key).catch(() => null),
    listDealsForAddress(key).catch(() => []),
    loadInputs(key),
  ]);
  const result = compute(inputs);
  const value = buildPassport({
    address: key,
    displayName: profile?.displayName || null,
    tag: profile?.handle ?? null,
    tier: result.tier,
    memberSince: profile?.createdAt ?? null,
    facts: sealedFactsFor(deals, key, inputs.failedCount),
  });

  for (const [k, entry] of passportCache) {
    if (now - entry.at >= PASSPORT_CACHE_TTL_MS) passportCache.delete(k);
  }
  if (passportCache.size >= PASSPORT_CACHE_MAX) {
    const oldest = passportCache.keys().next().value;
    if (oldest !== undefined) passportCache.delete(oldest);
  }
  passportCache.set(key, { value, at: now });
  return value;
}
