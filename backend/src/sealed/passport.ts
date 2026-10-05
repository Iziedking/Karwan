/// The public passport: what anyone else may see about a person. Built only
/// from fixed reasons and the tier; the score and every count stay with the
/// owner.

import type { Tier } from '../reputation/config.js';
import { PASSPORT_KEYS, assertOnlyKeys } from './allowlist.js';
import { reasonsFor, type ReasonCode, type SealedFacts } from './reasons.js';

export interface PublicPassport {
  sealed: true;
  address: string;
  displayName: string | null;
  tag: string | null;
  tier: Tier;
  reasons: ReasonCode[];
  memberSince: number | null;
}

/// The deal fields the sealed facts read. `DirectDeal` satisfies it.
export interface SealedDeal {
  buyer: string;
  seller: string;
  settledAt?: number;
  cancelledAt?: number;
  deliveredAt?: number;
  deadlineUnix?: number;
  highSignalVerification?: { buyer?: { status: string }; seller?: { status: string } };
}

export function sealedFactsFor(deals: SealedDeal[], subject: string, disputesLost: number): SealedFacts {
  const me = subject.toLowerCase();
  const mine = deals.filter((deal) => deal.buyer.toLowerCase() === me || deal.seller.toLowerCase() === me);
  const settled = mine.filter((deal) => deal.settledAt != null && deal.cancelledAt == null);
  const counterparties = new Set(
    settled.map((deal) => (deal.buyer.toLowerCase() === me ? deal.seller : deal.buyer).toLowerCase()),
  );
  const timed = settled.filter(
    (deal) => deal.seller.toLowerCase() === me && deal.deadlineUnix != null && deal.deliveredAt != null,
  );
  const onTime = timed.filter((deal) => (deal.deliveredAt as number) <= (deal.deadlineUnix as number) * 1000).length;
  const personVerified = mine.some((deal) => {
    const role = deal.seller.toLowerCase() === me ? 'seller' : 'buyer';
    return deal.highSignalVerification?.[role]?.status === 'verified';
  });
  return {
    settled: settled.length,
    distinctCounterparties: counterparties.size,
    onTime,
    withDeadline: timed.length,
    disputesLost,
    personVerified,
  };
}

export function buildPassport(input: {
  address: string;
  displayName: string | null;
  tag: string | null;
  tier: Tier;
  memberSince: number | null;
  facts: SealedFacts;
}): PublicPassport {
  const passport: PublicPassport = {
    sealed: true,
    address: input.address.toLowerCase(),
    displayName: input.displayName,
    tag: input.tag,
    tier: input.tier,
    reasons: reasonsFor(input.facts),
    memberSince: input.memberSince,
  };
  assertOnlyKeys(passport, PASSPORT_KEYS);
  return passport;
}

export function isOwnerView(viewer: string | null | undefined, subject: string): boolean {
  return !!viewer && viewer.toLowerCase() === subject.toLowerCase();
}
