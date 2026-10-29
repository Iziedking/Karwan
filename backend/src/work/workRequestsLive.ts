import { randomBytes } from 'node:crypto';
import type { Address } from 'viem';
import { resolveSellerProfilesForUsers } from '../agents/agent-registry.js';
import { config } from '../config.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { workRequestsStore } from '../db/workRequests.js';
import { bus } from '../events.js';
import { extractKeywords } from '../llm/keywords.js';
import { locationOf } from '../location/live.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { loadPublicRating } from '../ratings/publicRating.js';
import { compute as computeReputation } from '../reputation/engine.js';
import { countsFor } from '../reputation/recordRead.js';
import { loadInputs } from '../reputation/signals.js';
import { levelOf } from '../verification/live.js';
import { rankWorkOffers, type WorkRankDeps } from './workRank.js';
import { createWorkRequests } from './workRequests.js';
import { work } from './workLive.js';

/// Hourly work posted to the market, bound to the seller index, the record
/// and the hourly work core. Null where hourly work is off.

/// The most sellers told about one piece of work when it is posted.
const REACH_LIMIT = 25;

const rankDeps: WorkRankDeps = {
  // The hirer's agent ranks from Karwan's own record here, with no paid reads.
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

export const workRequests = work
  ? createWorkRequests({
    store: workRequestsStore,
    draftWork: (hirer, input) => work!.draft(hirer, input),
    offerWork: (hirer, input, opts) => work!.offer(hirer, input, opts),
    sellerAgentFor: async (user) => {
      const w = await getAgentWallets(user);
      return w?.sellerAddress ? { address: w.sellerAddress as Address } : null;
    },
    keywords: (text) => extractKeywords(text, 'work'),
    reach: async (r) => {
      if (!sellerIndex.isBuilt()) await sellerIndex.rebuild();
      const fits = rankSellers(sellerIndex.entries(), { jobId: r.id, keywords: r.keywords, briefText: `${r.title}. ${r.brief}`, tradeType: 'service' });
      return fits.byWords.slice(0, REACH_LIMIT).map((s) => s.userAddress as Address);
    },
    rank: (r, offers) => rankWorkOffers(r, offers, rankDeps, Date.now()),
    tellPerson: (address, text, path) => bus.emitEvent({ type: 'work.update', actor: 'platform', payload: { address, text, path } }),
    now: () => Date.now(),
    newId: (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`,
  })
  : null;
