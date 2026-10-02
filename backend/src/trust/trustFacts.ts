/// Gathers what the trust engine reads about a person, from records Karwan
/// already keeps: their deals, their profile and any flagged links.

import { listDealsForAddress, type DirectDeal } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { getLinkOffenseCount } from '../security/linkOffenses.js';
import { TRUST_LIMITS, type PartyFacts } from './riskEngine.js';

const DAY_MS = 86_400_000;

export function partyFactsFrom(
  address: string,
  deals: DirectDeal[],
  profileCreatedAt: number | null,
  linkOffenses: number,
  now = Date.now(),
): PartyFacts {
  const me = address.toLowerCase();
  let settledDeals = 0;
  let worldIdPassed = false;
  let lostDisputes = 0;
  let dealsLastDay = 0;
  for (const deal of deals) {
    const role = deal.buyer === me ? 'buyer' : deal.seller === me ? 'seller' : null;
    if (!role) continue;
    if (deal.settledAt && !deal.cancelledAt) settledDeals += 1;
    if (deal.highSignalVerification?.[role]?.status === 'verified') worldIdPassed = true;
    if (deal.disputeLoser === role) lostDisputes += 1;
    if (now - deal.createdAt < TRUST_LIMITS.fastWindowMs) dealsLastDay += 1;
  }
  return {
    settledDeals,
    worldIdPassed,
    lostDisputes,
    dealsLastDay,
    accountAgeDays: profileCreatedAt === null ? null : Math.floor((now - profileCreatedAt) / DAY_MS),
    linkOffenses,
  };
}

export async function loadPartyFacts(address: string, now = Date.now()): Promise<PartyFacts> {
  const [deals, profile] = await Promise.all([listDealsForAddress(address), getProfile(address.toLowerCase())]);
  return partyFactsFrom(address, deals, profile?.createdAt ?? null, getLinkOffenseCount(address), now);
}
