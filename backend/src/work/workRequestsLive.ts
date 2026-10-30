import { randomBytes } from 'node:crypto';
import type { Address } from 'viem';
import { sealedSellerDeps } from '../agents/sealedSellersLive.js';
import { timeOffer, waysOf } from '../agents/ways.js';
import { getAgentWallets } from '../db/agentWallets.js';
import { getProfile } from '../db/profiles.js';
import { workRequestsStore } from '../db/workRequests.js';
import { bus } from '../events.js';
import { extractKeywords } from '../llm/keywords.js';
import { rankSellers, sellerIndex } from '../matching/sellerIndex.js';
import { rankWorkOffers } from './workRank.js';
import { createWorkRequests } from './workRequests.js';
import { work } from './workLive.js';

/// Hourly work posted to the market, bound to the seller index, the record
/// and the hourly work core. Null where hourly work is off.

/// The most sellers told about one piece of work when it is posted.
const REACH_LIMIT = 25;

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
    rank: (r, offers) => rankWorkOffers(r, offers, sealedSellerDeps, Date.now()),
    tellPerson: (address, text, path) => bus.emitEvent({ type: 'work.update', actor: 'platform', payload: { address, text, path } }),
    timeOfferFor: async (seller, work) => {
      const profile = await getProfile(seller).catch(() => null);
      return profile?.agentWays ? timeOffer(waysOf(profile).sell, work) : null;
    },
    now: () => Date.now(),
    newId: (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`,
  })
  : null;
