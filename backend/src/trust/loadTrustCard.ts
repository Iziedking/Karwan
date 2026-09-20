import { listDealsForAddress } from '../db/deals.js';
import { getProfile } from '../db/profiles.js';
import { milestoneAmountUsdc } from '../deals/dealView.js';
import { trustCard, trustFacts, type TrustCard, type TrustFacts } from './trustCard.js';

export interface TrustDealContext {
  dealAmountUsdc: string;
  acceptedAt?: number;
  requireStake?: boolean;
  requireStakePct?: number;
  /// True when this deal's World ID check verified the subject's side.
  subjectPersonVerified: boolean;
}

/// The part of a trust card that only depends on who the subject is, not on
/// which deal is asking: the profile read and the deal-history scan. Cached
/// briefly so a deal page that renders the trust card alongside movements,
/// events and the assistant doesn't repeat both lookups within the same
/// handful of seconds. Stake and personVerified are per-deal and never cached.
interface CachedSubjectTrust {
  facts: TrustFacts;
  memberSince: number | null;
  displayName: string | null;
  companyName: string | null;
  businessVerified: boolean;
  xProven: boolean;
  fetchedAt: number;
}

const SUBJECT_TRUST_CACHE_TTL_MS = 60_000;
const SUBJECT_TRUST_CACHE_MAX_ENTRIES = 1000;
const subjectTrustCache = new Map<string, CachedSubjectTrust>();

function subjectTrustCacheKey(subject: string, role: 'seller' | 'buyer'): string {
  return `${subject.toLowerCase()}:${role}`;
}

async function loadSubjectTrust(subject: string, role: 'seller' | 'buyer'): Promise<CachedSubjectTrust> {
  const key = subjectTrustCacheKey(subject, role);
  const now = Date.now();
  const hit = subjectTrustCache.get(key);
  if (hit && now - hit.fetchedAt < SUBJECT_TRUST_CACHE_TTL_MS) return hit;

  const [profile, deals] = await Promise.all([getProfile(subject), listDealsForAddress(subject)]);
  const value: CachedSubjectTrust = {
    facts: trustFacts(deals, subject, role),
    memberSince: profile?.createdAt ?? null,
    displayName: profile?.displayName ?? null,
    companyName: profile?.smeProfile?.companyName ?? null,
    businessVerified: profile?.business?.status === 'verified',
    xProven: !!profile?.xUserId,
    fetchedAt: now,
  };

  // Bounded: sweep expired entries on every write, then drop the oldest
  // survivor if still at the cap, so a burst of distinct subjects can't
  // grow this without limit.
  for (const [existingKey, entry] of subjectTrustCache) {
    if (now - entry.fetchedAt >= SUBJECT_TRUST_CACHE_TTL_MS) subjectTrustCache.delete(existingKey);
  }
  if (subjectTrustCache.size >= SUBJECT_TRUST_CACHE_MAX_ENTRIES) {
    const oldestKey = subjectTrustCache.keys().next().value;
    if (oldestKey !== undefined) subjectTrustCache.delete(oldestKey);
  }
  subjectTrustCache.set(key, value);
  return value;
}

export async function loadTrustCard(
  subject: string,
  role: 'seller' | 'buyer',
  deal: TrustDealContext,
): Promise<TrustCard> {
  const cached = await loadSubjectTrust(subject, role);
  const stakeUsdc = role === 'seller' && deal.requireStake && deal.acceptedAt
    ? milestoneAmountUsdc(deal.dealAmountUsdc, deal.requireStakePct ?? 50)
    : null;
  return trustCard({
    role,
    facts: cached.facts,
    memberSince: cached.memberSince,
    displayName: cached.displayName,
    companyName: cached.companyName,
    businessVerified: cached.businessVerified,
    personVerified: deal.subjectPersonVerified,
    xProven: cached.xProven,
    stakeUsdc,
  });
}

/// Test-only seam: clears the cache so tests don't leak state into each
/// other, and reports its size so a test can assert on hit/miss behavior
/// without reaching into module internals.
export function __clearTrustCardCacheForTests(): void {
  subjectTrustCache.clear();
}

export function __trustCardCacheSizeForTests(): number {
  return subjectTrustCache.size;
}
