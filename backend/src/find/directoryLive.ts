import { isVerified } from '../agents/shortlist.js';
import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { loadPublicRating } from '../ratings/publicRating.js';
import { compute as computeReputation } from '../reputation/engine.js';
import { countsFor } from '../reputation/recordRead.js';
import { loadInputs } from '../reputation/signals.js';
import { levelOf } from '../verification/live.js';
import type { DirectoryDeps } from './directory.js';

/// The directory's reads: the seller index and Karwan's own record.
export const liveDirectoryDeps: DirectoryDeps = {
  async byWords(need) {
    if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
    return rankSellers(sellerIndex.entries(), {
      jobId: 'find',
      keywords: need.keywords,
      briefText: need.text,
      tradeType: need.kind === 'goods' ? 'goods' : 'service',
    }).byWords;
  },
  profile: (user) => getProfile(user),
  async record(user) {
    const [level, inputs, deals, rating] = await Promise.all([
      levelOf(user),
      loadInputs(user),
      listDealsForAddress(user).catch(() => []),
      loadPublicRating(user).catch(() => ({ kind: 'new' as const, count: 0 })),
    ]);
    const counts = countsFor(deals, user);
    return {
      verified: isVerified(level),
      tier: computeReputation(inputs).tier,
      rating,
      onTimeRate: counts.onTimeRate,
      completed: counts.completed,
      disputesLost: counts.disputesLost,
    };
  },
};
