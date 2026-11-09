import type { Meet } from '../db/profiles.js';
import { topicalMatchScore } from '../llm/keywords.js';
import { distanceKm, distanceLine, locationFit, servesCountry, type DeliveryKind, type DistanceLine, type PrivateLocation, type Where } from '../location/rules.js';
import { ratingLine, type PublicRating } from '../ratings/rules.js';
import { tierRank, type Tier } from '../reputation/config.js';

/// Who comes up when an agent finds people (view 72, spec "Ranking"). Pure and
/// the same for the website, Telegram and outside agents. Skill fit first, then
/// whether they can serve the buyer, then reputation, then distance, then price.
/// A row carries a rounded distance line, never a point, an area or a score.

export const FIND_MAX = 5;
/// How far a buyer is expected to go to a seller's own place.
export const AT_MY_PLACE_KM = 25;
const MATCH_BAND = 25;
const ON_TIME_REASON_MIN = 80;
const MAX_REASONS = 3;
const NEW_RATING = 3.5;

export interface FindCandidate {
  user: string;
  sellerAgent: string;
  name: string;
  tag: string | null;
  /// What they sell and have done.
  words: string[];
  meet: Meet;
  location: PrivateLocation | null;
  verified: boolean;
  tier: Tier;
  rating: PublicRating;
  /// Their main way's prices, or none set ("Asks for a quote").
  price: { min: number; usual: number } | null;
  days: { min: number; max: number } | null;
  onTimeRate: number | null;
  completed: number;
  disputesLost: number;
  contactFrom: 'anyone' | 'verified';
  /// They let agents outside Karwan find them (view 15).
  outsideAgents: boolean;
}

export interface FindNeed {
  text: string;
  keywords: string[];
  budgetUsdc: number;
  kind: DeliveryKind;
  where: Where;
  buyer: string;
  buyerLocation: PrivateLocation | null;
  buyerVerified: boolean;
}

export type FindReason = 'best_fit' | 'nearby' | 'verified' | 'within_budget' | 'on_time_record';

export interface FoundRow {
  user: string;
  sellerAgent: string;
  tag: string | null;
  name: string;
  verified: boolean;
  tier: Tier;
  rating: string;
  /// The rating and how many deals it is from, for each language to word; null while New.
  stars: number | null;
  ratings: number;
  distance: DistanceLine;
  meet: Meet;
  /// What they would likely ask inside the budget, or null for a quote.
  priceUsdc: string | null;
  days: number | null;
  reasons: FindReason[];
  recommended: boolean;
}

export interface FindRankOptions {
  requireVerified: boolean;
  /// People blocked by the buyer or who blocked the buyer.
  blocked: ReadonlySet<string>;
  /// On testnet a clean record may stand in for verification when recommending.
  cleanRecordCounts: boolean;
  max?: number;
}

interface Scored {
  c: FindCandidate;
  band: number;
  km: number | null;
  fit: 0 | 1 | 2 | 3 | 4;
}

const lower = (s: string) => s.toLowerCase();
const ratingRank = (r: PublicRating) => (r.kind === 'rated' ? r.value : NEW_RATING);

function kmBetween(a: PrivateLocation | null, b: PrivateLocation | null): number | null {
  return a?.point && b?.point ? distanceKm(a.point, b.point) : null;
}

/// Whether they can do it for this buyer at all.
function canServe(c: FindCandidate, need: FindNeed, km: number | null, fit: number): boolean {
  if (need.kind === 'remote') return c.meet.online;
  if (need.kind === 'goods') {
    const country = need.where.country?.toUpperCase() ?? need.buyerLocation?.country ?? null;
    return servesCountry(c.location, country, 'goods') === 'yes';
  }
  if (km !== null) return (c.meet.atMyPlace && km <= AT_MY_PLACE_KM) || (c.meet.comeToYouKm !== null && km <= c.meet.comeToYouKm);
  // No points: the same city by name, for someone who meets people in person.
  return fit >= 3 && (c.meet.atMyPlace || c.meet.comeToYouKm !== null);
}

function compare(a: Scored, b: Scored): number {
  return (
    b.band - a.band ||
    Number(b.c.verified) - Number(a.c.verified) ||
    tierRank(b.c.tier) - tierRank(a.c.tier) ||
    ratingRank(b.c.rating) - ratingRank(a.c.rating) ||
    (a.km ?? Infinity) - (b.km ?? Infinity) ||
    b.fit - a.fit ||
    (a.c.price?.min ?? Infinity) - (b.c.price?.min ?? Infinity)
  );
}

function reasonsFor(s: Scored, first: boolean, need: FindNeed): FindReason[] {
  const out: FindReason[] = [];
  if (first) out.push('best_fit');
  if (need.kind === 'in_person' && ((s.km !== null && s.km <= 20) || s.fit >= 3)) out.push('nearby');
  if (s.c.verified) out.push('verified');
  if (s.c.price && s.c.price.usual <= need.budgetUsdc) out.push('within_budget');
  if ((s.c.onTimeRate ?? 0) >= ON_TIME_REASON_MIN) out.push('on_time_record');
  return out.slice(0, MAX_REASONS);
}

export function rankForFind(candidates: readonly FindCandidate[], need: FindNeed, opts: FindRankOptions): FoundRow[] {
  const buyer = lower(need.buyer);
  const seen = new Set<string>();
  const tags = need.keywords.length ? need.keywords : [need.text];
  const scored: Scored[] = [];
  for (const c of candidates) {
    const user = lower(c.user);
    if (user === buyer || seen.has(user) || opts.blocked.has(user)) continue;
    if (opts.requireVerified && !c.verified) continue;
    if (c.contactFrom === 'verified' && !need.buyerVerified) continue;
    const match = topicalMatchScore(tags, c.words);
    if (match === 0) continue;
    if (c.price && c.price.min > need.budgetUsdc) continue;
    const km = kmBetween(need.buyerLocation, c.location);
    const fit = locationFit(need.where, need.buyerLocation, c.location, need.kind);
    if (!canServe(c, need, km, fit)) continue;
    seen.add(user);
    scored.push({ c, band: Math.ceil(match / MATCH_BAND), km, fit });
  }
  const ranked = scored.sort(compare).slice(0, opts.max ?? FIND_MAX);
  const fits = (s: Scored) => !s.c.price || s.c.price.min <= need.budgetUsdc;
  const recommended =
    ranked.find((s) => fits(s) && s.c.verified) ??
    (opts.cleanRecordCounts ? ranked.find((s) => fits(s) && s.c.completed > 0 && s.c.disputesLost === 0) : undefined);
  // The buyer's own city, never the seller's area.
  const city = need.buyerLocation?.city ?? null;
  return ranked.map((s, i) => ({
    user: s.c.user,
    sellerAgent: s.c.sellerAgent,
    tag: s.c.tag,
    name: s.c.name,
    verified: s.c.verified,
    tier: s.c.tier,
    rating: ratingLine(s.c.rating),
    stars: s.c.rating.kind === 'rated' ? s.c.rating.value : null,
    ratings: s.c.rating.count,
    distance: need.kind === 'in_person' ? distanceLine(s.km, s.fit, city) : { key: 'unknown' },
    meet: s.c.meet,
    priceUsdc: s.c.price ? String(Math.min(s.c.price.usual, need.budgetUsdc)) : null,
    days: s.c.days?.max ?? null,
    reasons: reasonsFor(s, i === 0, need),
    recommended: s === recommended,
  }));
}
