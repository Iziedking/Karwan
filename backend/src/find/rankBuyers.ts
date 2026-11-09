import type { Meet } from '../db/profiles.js';
import { topicalMatchScore } from '../llm/keywords.js';
import { distanceLine, locationFit, type DeliveryKind, type DistanceLine, type PrivateLocation, type Where } from '../location/rules.js';
import { tierRank, type Tier } from '../reputation/config.js';
import type { StandingNeed } from './needs.js';
import { canMeet, kmBetween } from './rank.js';

/// Who a seller's agent finds (view 72, Phase 4, find_customers): open
/// requests on the market that fit them, and the standing needs of buyers who
/// let sellers reach them. Pure. Skill fit first, then distance, then the
/// buyer's record. A row says how far the buyer is, never where, and never
/// who they are: a seller learns that through an offer the buyer answers.

export const LEADS_MAX = 5;
const MATCH_BAND = 25;

export interface LeadCandidate {
  kind: 'request' | 'need';
  /// The request's id, or the need's id.
  ref: string;
  buyer: string;
  what: string;
  keywords: string[];
  budgetUsdc: number | null;
  every: StandingNeed['every'] | null;
  deliveryKind: DeliveryKind;
  where: Where;
  buyerLocation: PrivateLocation | null;
  buyerVerified: boolean;
  buyerTier: Tier;
  /// Days left on a request; null for a need.
  dueDays: number | null;
  /// A request on the open market, or a need that is not paused from a buyer
  /// who let sellers reach them. Anything else is never listed.
  open: boolean;
  /// The buyer takes offers only from verified people.
  contactFrom: 'anyone' | 'verified';
}

export interface LeadSeller {
  user: string;
  words: string[];
  meet: Meet;
  location: PrivateLocation | null;
  verified: boolean;
  /// Their lowest price for this kind of work, when they set one.
  priceMin: number | null;
}

export interface LeadRow {
  kind: 'request' | 'need';
  ref: string;
  buyer: string;
  what: string;
  budgetUsdc: string | null;
  every: StandingNeed['every'] | null;
  deliveryKind: DeliveryKind;
  dueDays: number | null;
  distance: DistanceLine;
  buyerVerified: boolean;
  buyerTier: Tier;
}

interface Scored {
  l: LeadCandidate;
  band: number;
  km: number | null;
  fit: 0 | 1 | 2 | 3 | 4;
}

function compare(a: Scored, b: Scored): number {
  return (
    b.band - a.band ||
    (a.km ?? Infinity) - (b.km ?? Infinity) ||
    b.fit - a.fit ||
    Number(b.l.buyerVerified) - Number(a.l.buyerVerified) ||
    tierRank(b.l.buyerTier) - tierRank(a.l.buyerTier)
  );
}

export function rankBuyersFor(leads: readonly LeadCandidate[], seller: LeadSeller, opts: { blocked: ReadonlySet<string>; max?: number }): LeadRow[] {
  const me = seller.user.toLowerCase();
  const seen = new Set<string>();
  const scored: Scored[] = [];
  for (const l of leads) {
    const buyer = l.buyer.toLowerCase();
    const key = `${l.kind}:${l.ref}`;
    if (!l.open || buyer === me || seen.has(key) || opts.blocked.has(buyer)) continue;
    if (l.contactFrom === 'verified' && !seller.verified) continue;
    const match = topicalMatchScore(l.keywords.length ? l.keywords : [l.what], seller.words);
    if (match === 0) continue;
    if (seller.priceMin !== null && l.budgetUsdc !== null && seller.priceMin > l.budgetUsdc) continue;
    const km = kmBetween(l.buyerLocation, seller.location);
    const fit = locationFit(l.where, l.buyerLocation, seller.location, l.deliveryKind);
    if (!canMeet(seller, { kind: l.deliveryKind, where: l.where, buyerLocation: l.buyerLocation }, km, fit)) continue;
    seen.add(key);
    scored.push({ l, band: Math.ceil(match / MATCH_BAND), km, fit });
  }
  // Their own city, never the buyer's area.
  const city = seller.location?.city ?? null;
  return scored.sort(compare).slice(0, opts.max ?? LEADS_MAX).map(({ l, km, fit }) => ({
    kind: l.kind,
    ref: l.ref,
    buyer: l.buyer.toLowerCase(),
    what: l.what,
    budgetUsdc: l.budgetUsdc === null ? null : String(l.budgetUsdc),
    every: l.every,
    deliveryKind: l.deliveryKind,
    dueDays: l.dueDays,
    distance: l.deliveryKind === 'in_person' ? distanceLine(km, fit, city) : { key: 'unknown' },
    buyerVerified: l.buyerVerified,
    buyerTier: l.buyerTier,
  }));
}
