import { config } from '../config.js';
import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { locationOf } from '../location/live.js';
import { sellerIndex } from '../matching/sellerIndex.js';
import { loadPublicRating } from '../ratings/publicRating.js';
import { compute as computeReputation } from '../reputation/engine.js';
import { countsFor } from '../reputation/recordRead.js';
import { loadInputs } from '../reputation/signals.js';
import { levelOf } from '../verification/live.js';
import { resolveSellerProfilesForUsers } from './agent-registry.js';
import type { SealedSellerDeps } from './sealedSellers.js';

/// The seller block's reads, shared by fixed-price offers and hourly work.
/// The buyer's agent ranks from Karwan's own record here, with no paid reads.
export const sealedSellerDeps: SealedSellerDeps = {
  readRecord: async () => null,
  level: (user) => levelOf(user),
  engine: async (user) => {
    const [inputs, deals] = await Promise.all([loadInputs(user), listDealsForAddress(user).catch(() => [])]);
    const result = computeReputation(inputs);
    return { score: result.score, tier: result.tier, counts: countsFor(deals, user) };
  },
  profile: async (user) => {
    const p = await getProfile(user).catch(() => null);
    return { name: p?.displayName?.trim() || null, tag: p?.handle ?? null };
  },
  location: locationOf,
  rating: (user) => loadPublicRating(user),
  timeoutMs: 2_000,
  sellerWords: async (user) => {
    const indexed = sellerIndex.get(user);
    if (indexed) return indexed.words;
    const [sp] = await resolveSellerProfilesForUsers([user]);
    return sp ? [...sp.keywords, ...sp.skills] : [];
  },
  cleanRecordCounts: config.ARC_NETWORK === 'testnet',
};
