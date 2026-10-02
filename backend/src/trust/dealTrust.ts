/// Runs the trust engine for one deal and returns the fields to store with it.
/// Called when a deal is created, when its terms change before acceptance and
/// when an invited counterparty claims it, so the decision always matches the
/// people and the terms the other side is about to agree to.

import type { DirectDeal } from '../db/deals.js';
import { priceAnomalyScore } from '../agents/signals.js';
import { worldIdDealSessionsConfigured } from '../routes/worldId.js';
import { trustPatch } from './applyDecision.js';
import { decideTrust, mentionsGithubDelivery, type TrustDecision } from './riskEngine.js';
import { loadPartyFacts } from './trustFacts.js';

const PENDING = /^0x0{40}$/i;

type TrustSubject = Pick<
  DirectDeal,
  | 'buyer'
  | 'seller'
  | 'dealAmountUsdc'
  | 'terms'
  | 'verificationPolicy'
  | 'verificationSubject'
  | 'highSignalVerification'
  | 'evidenceRequired'
  | 'requireStake'
  | 'requireStakePct'
>;

export async function decideDealTrust(deal: Pick<DirectDeal, 'buyer' | 'seller' | 'dealAmountUsdc' | 'terms'>): Promise<TrustDecision> {
  const sellerKnown = !!deal.seller && !PENDING.test(deal.seller);
  const [buyer, seller] = await Promise.all([
    loadPartyFacts(deal.buyer),
    sellerKnown ? loadPartyFacts(deal.seller) : Promise.resolve(null),
  ]);
  const amountUsdc = Number(deal.dealAmountUsdc);
  return decideTrust({
    buyer,
    seller,
    deal: { amountUsdc, priceZ: priceAnomalyScore(amountUsdc), githubDelivery: mentionsGithubDelivery(deal.terms ?? '') },
    worldIdAvailable: worldIdDealSessionsConfigured(),
  });
}

export async function dealTrustPatch(deal: TrustSubject): Promise<Partial<DirectDeal>> {
  return trustPatch(deal, await decideDealTrust(deal));
}
