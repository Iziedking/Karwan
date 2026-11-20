import { isVerified } from '../agents/shortlist.js';
import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { meaningKeeper } from '../matching/meaningKeeper.js';
import { REQUEST_MEANING_WAIT_MS } from '../matching/meaningLive.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { loadRatingForWork, termsOf } from '../ratings/publicRating.js';
import { compute as computeReputation } from '../reputation/engine.js';
import { countsFor } from '../reputation/recordRead.js';
import { loadInputs } from '../reputation/signals.js';
import { levelOf } from '../verification/live.js';
import type { DirectoryDeps } from './directory.js';

/// The directory's reads: the seller index and Karwan's own record.
export const liveDirectoryDeps: DirectoryDeps = {
  async byWords(need, meaning) {
    if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
    return rankSellers(
      sellerIndex.entries(),
      {
        jobId: 'find',
        keywords: need.keywords,
        briefText: need.text,
        tradeType: need.kind === 'goods' ? 'goods' : 'service',
      },
      undefined,
      meaning,
    ).byWords;
  },
  /// The need's meaning vector (view 95 phase 2), waited for 1.5 s at most; a
  /// standing order's is kept under its id.
  async meaning(need) {
    const save = need.ref ? { kind: 'need' as const, ref: need.ref.id, owner: need.ref.owner } : undefined;
    const q = await meaningKeeper.query(need.text, { timeoutMs: REQUEST_MEANING_WAIT_MS, ...(save ? { save } : {}) });
    return meaningKeeper.scorer(q, 'seller');
  },
  profile: (user) => getProfile(user),
  async record(user, need) {
    const read = listDealsForAddress(user).catch(() => []);
    const [level, inputs, deals, rating] = await Promise.all([
      levelOf(user),
      loadInputs(user),
      read,
      loadRatingForWork(user, need?.keywords ?? [], Date.now(), async () => termsOf(await read)).catch(
        () => ({ kind: 'new' as const, count: 0 }),
      ),
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
