import type { Ladder } from '../verification/ladder.js';
import { ratingLine, type PublicRating } from '../ratings/rules.js';
import type { RecordCounts } from '../reputation/recordRead.js';

/// The shortlist a buyer chooses from (view 41, decisions 11 to 13). Pure. Every
/// seller who fits and offered is listed: fit first (skill band, then place),
/// then reputation and score, then how close the terms are to the request.
/// Only a verified seller inside the budget, whose agent is linked to them, can
/// be recommended; an offer above the budget is marked outside the request, and
/// an agent not linked to its owner is marked and cannot be chosen until it is.

export type RecommendReason = 'best_fit' | 'verified' | 'within_budget' | 'lower_price' | 'on_time_record' | 'nearby';

export interface ShortlistCandidate {
  seller: string;
  sellerUser: string;
  name: string;
  tag: string | null;
  level: Ladder;
  matchBand: number;
  deterministicScore: number;
  engineScore: number;
  tier: string;
  counts: RecordCounts;
  offer: string;
  deliveryDays: number;
  askedUsdc: number;
  recordChecked: boolean;
  /// 0-4 from location/rules.ts locationFit. Read for ranking, never shown.
  locationFit: number;
  /// The only location that reaches the buyer.
  country: string | null;
  /// Public: mean of revealed ratings, or New under three.
  rating: PublicRating;
  /// The seller's agent is linked to its owner; absent means linked.
  linked?: boolean;
  /// Days the offer needs beyond what the request gives (view 41, step three).
  extraDays?: number;
}

export interface ShortlistEntry {
  rank: number;
  seller: string;
  sellerUser: string;
  name: string;
  tag: string | null;
  level: Ladder;
  verified: boolean;
  score: number;
  tier: string;
  counts: { completed: number; onTimeRate: number | null; disputesLost: number };
  offer: string;
  deliveryDays: number;
  priceUsdc: number;
  askedUsdc: number | null;
  recordChecked: boolean;
  recommended: boolean;
  reasons: RecommendReason[];
  state: 'negotiating' | 'ready' | 'unavailable';
  isNew: boolean;
  country: string | null;
  rating: PublicRating;
  /// The offer asks more than the buyer's budget. Absent on lists saved before 30 Oct.
  outsideRequest?: boolean;
  /// The seller's agent is not linked to its owner yet: listed, never chosen.
  mustLink?: boolean;
  /// Days the offer needs beyond what the request gives; 0 when it fits the date.
  extraDays?: number;
}

/// How many offers get a paid record read; every offer is listed.
export const SHORTLIST_MAX = 5;
const ON_TIME_REASON_MIN = 80;
const MAX_REASONS = 3;

export function isVerified(level: Ladder): boolean {
  return level === 'work_verified' || level === 'id_verified';
}

/// A rated person by their rating; anyone still New (under three) sits at a
/// neutral 3.5, above a poor record and below a good one.
const NEW_RANK = 3.5;
const ratingRank = (r: PublicRating) => (r.kind === 'rated' ? r.value : NEW_RANK);

const linked = (c: ShortlistCandidate) => c.linked !== false;

export function rankCandidates(cands: readonly ShortlistCandidate[], budgetUsdc?: number): ShortlistCandidate[] {
  const over = (c: ShortlistCandidate) => (budgetUsdc === undefined ? 0 : Math.max(0, c.askedUsdc - budgetUsdc));
  const later = (c: ShortlistCandidate) => c.extraDays ?? 0;
  return [...cands].sort(
    (a, b) =>
      b.matchBand - a.matchBand ||
      b.locationFit - a.locationFit ||
      Number(isVerified(b.level)) - Number(isVerified(a.level)) ||
      ratingRank(b.rating) - ratingRank(a.rating) ||
      b.engineScore - a.engineScore ||
      over(a) - over(b) ||
      later(a) - later(b) ||
      b.deterministicScore - a.deterministicScore ||
      a.askedUsdc - b.askedUsdc,
  );
}

/// A verified seller inside the budget, best first. On testnet, where few
/// people have done the person check yet, a seller with settled Karwan deals
/// and no lost dispute may be recommended when no verified one fits; they
/// stay marked not verified, and choosing them still asks the buyer to confirm.
/// What the shortlist measures against (view 35): it may recommend up to the
/// budget plus the buyer's leeway and counter it toward the budget, while
/// "within budget" and Agree for me keep meaning the budget itself.
export function shortlistLimits(budgetUsdc: number, leewayPct: number | undefined): { recommendUpTo: number; budget: number } {
  const leeway = leewayPct && leewayPct > 0 ? leewayPct : 0;
  return { recommendUpTo: Number((budgetUsdc * (1 + leeway / 100)).toFixed(6)), budget: budgetUsdc };
}

export function pickRecommended(
  ranked: readonly ShortlistCandidate[],
  budgetUsdc: number,
  unavailable: ReadonlySet<string> = new Set(),
  opts: { cleanRecordCounts?: boolean } = {},
): ShortlistCandidate | null {
  const open = ranked.filter(
    (c) => c.askedUsdc <= budgetUsdc && !(c.extraDays ?? 0) && linked(c) && !unavailable.has(c.seller.toLowerCase()),
  );
  const verified = open.find((c) => isVerified(c.level));
  if (verified || !opts.cleanRecordCounts) return verified ?? null;
  return open.find((c) => c.counts.completed > 0 && c.counts.disputesLost === 0) ?? null;
}

/// Sellers already marked unavailable, so a refresh keeps them that way.
export function unavailableSellers(entries: readonly ShortlistEntry[]): Set<string> {
  return new Set(entries.filter((e) => e.state === 'unavailable').map((e) => e.seller.toLowerCase()));
}

function reasonsFor(rec: ShortlistCandidate, ranked: readonly ShortlistCandidate[], budgetUsdc: number): RecommendReason[] {
  const out: RecommendReason[] = [];
  if (ranked[0]?.seller === rec.seller) out.push('best_fit');
  // Someone looking nearby cares about this before the rest.
  if (rec.locationFit >= 2) out.push('nearby');
  if (isVerified(rec.level)) out.push('verified');
  if (rec.askedUsdc <= budgetUsdc) out.push('within_budget');
  if (ranked.length > 1 && ranked.every((c) => c.seller === rec.seller || c.askedUsdc > rec.askedUsdc)) out.push('lower_price');
  if ((rec.counts.onTimeRate ?? 0) >= ON_TIME_REASON_MIN) out.push('on_time_record');
  return out.slice(0, MAX_REASONS);
}

export function toEntries(
  ranked: readonly ShortlistCandidate[],
  recommended: ShortlistCandidate | null,
  budgetUsdc: number,
  agreed: { seller: string; priceUsdc: number } | null,
  previous: readonly ShortlistEntry[],
): ShortlistEntry[] {
  const seen = new Set(previous.map((e) => e.seller.toLowerCase()));
  const before = new Map(previous.map((e) => [e.seller.toLowerCase(), e.state]));
  return ranked.map((c, i) => {
    const was = before.get(c.seller.toLowerCase());
    const isRec = recommended?.seller === c.seller && was !== 'unavailable';
    const agreedPrice = agreed && agreed.seller.toLowerCase() === c.seller.toLowerCase() ? agreed.priceUsdc : null;
    return {
      rank: i + 1,
      seller: c.seller,
      sellerUser: c.sellerUser,
      name: c.name,
      tag: c.tag,
      level: c.level,
      verified: isVerified(c.level),
      score: Math.round(c.engineScore / 10),
      tier: c.tier,
      counts: { completed: c.counts.completed, onTimeRate: c.counts.onTimeRate, disputesLost: c.counts.disputesLost },
      offer: c.offer,
      deliveryDays: c.deliveryDays,
      priceUsdc: agreedPrice ?? c.askedUsdc,
      askedUsdc: agreedPrice !== null && agreedPrice !== c.askedUsdc ? c.askedUsdc : null,
      recordChecked: c.recordChecked,
      recommended: isRec,
      reasons: reasonsFor(c, ranked, budgetUsdc),
      state: was === 'unavailable' ? 'unavailable' : isRec && agreedPrice === null && was !== 'ready' ? 'negotiating' : 'ready',
      isNew: previous.length > 0 && !seen.has(c.seller.toLowerCase()),
      country: c.country,
      rating: c.rating,
      outsideRequest: c.askedUsdc > budgetUsdc || (c.extraDays ?? 0) > 0,
      mustLink: !linked(c),
      extraDays: c.extraDays ?? 0,
    };
  });
}

/// A seller who withdrew or whose offer expired stays on the list so the
/// buyer sees what changed, but cannot be chosen or recommended.
export function markUnavailable(entries: readonly ShortlistEntry[], seller: string): ShortlistEntry[] {
  const s = seller.toLowerCase();
  return entries.map((e) =>
    e.seller.toLowerCase() === s ? { ...e, state: 'unavailable', recommended: false, reasons: [] } : e,
  );
}

/// A seller's agent passes on a buyer who lost more disputes than they
/// completed, unless the seller chose to take such buyers.
export function shouldSkipBuyer(counts: RecordCounts | null, sellerOptsIn: boolean): boolean {
  return !!counts && !sellerOptsIn && counts.disputesLost > counts.completed;
}

export type ShortlistChoice = { ok: true } | { ok: false; code: 'unavailable' | 'unverified-needs-ack' | 'must-link' };

/// Checks a buyer's pick against the list before money moves. A seller not on
/// the list (past the first five, or after a restart) is checked by their
/// verification level, looked up by the caller.
export function shortlistChoiceCheck(
  entries: readonly ShortlistEntry[],
  seller: string,
  acknowledgeUnverified: boolean,
  offListVerified = true,
): ShortlistChoice {
  const entry = entries.find((e) => e.seller.toLowerCase() === seller.toLowerCase());
  if (!entry) return offListVerified || acknowledgeUnverified ? { ok: true } : { ok: false, code: 'unverified-needs-ack' };
  if (entry.state === 'unavailable') return { ok: false, code: 'unavailable' };
  if (entry.mustLink) return { ok: false, code: 'must-link' };
  if (!entry.verified && !acknowledgeUnverified) return { ok: false, code: 'unverified-needs-ack' };
  return { ok: true };
}

/// How the assistant should present the shortlist to the person. Once records
/// are sealed the rows carry no numbers, so it must not be asked for any.
export function assistantShortlistNote(sealed: boolean): string {
  const fields = sealed
    ? 'name, Verified or Not verified, tier, their reasons, offer, days and price'
    : 'name, Verified or Not verified, score, tier, completed deals, on-time percent, disputes lost, offer, days and price';
  return `Show each person by rank: ${fields} (with the opening ask when it differs). Say which one is Recommended and why, from its reasons. An offer marked outsideRequest asks more than the budget, outside the request: say so, and that the person may still choose it. One with extraDays needs that many days more than the request asked: say so. One marked mustLink is from a seller whose agent is not linked to them yet: say they cannot be chosen until they link it. Offer their profile at karwan.site/r/<tag>. The person chooses; to prepare it call propose_choose_offer with that row's seller value. Never show the seller value.`;
}

export type SealedShortlistEntry = Omit<ShortlistEntry, 'score' | 'counts'> & { score: null; counts: null };

/// What a person sees once records are sealed: who, how verified, tier and
/// reasons. Their agent used the numbers; the person never sees another
/// person's (D30).
export function sealEntries(entries: readonly ShortlistEntry[]): SealedShortlistEntry[] {
  return entries.map((e) => ({ ...e, score: null, counts: null }));
}

/// What the assistant gets: enough to describe each person and to pass the
/// chosen `seller` (an agent address, never shown) to the choose step. The
/// assistant talks to the person, so once records are sealed it gets no
/// numbers to repeat.
export function assistantView(entries: readonly ShortlistEntry[], sealed: boolean) {
  return [...entries]
    .sort((a, b) => a.rank - b.rank)
    .map((e) => ({
      rank: e.rank,
      seller: e.seller,
      name: e.name,
      tag: e.tag,
      verified: e.verified,
      tier: e.tier,
      rating: ratingLine(e.rating),
      ...(sealed
        ? {}
        : {
            score: e.score,
            completedDeals: e.counts.completed,
            onTimePercent: e.counts.onTimeRate,
            disputesLost: e.counts.disputesLost,
          }),
      offer: e.offer,
      deliveryDays: e.deliveryDays,
      priceUsdc: e.priceUsdc,
      askedUsdc: e.askedUsdc,
      recordChecked: e.recordChecked,
      recommended: e.recommended,
      reasons: e.reasons,
      available: e.state !== 'unavailable',
      outsideRequest: e.outsideRequest,
      mustLink: e.mustLink,
      extraDays: e.extraDays ?? 0,
    }));
}
