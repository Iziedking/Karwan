import type { Ladder } from '../verification/ladder.js';
import type { RecordCounts } from '../reputation/recordRead.js';

/// The shortlist a buyer chooses from. Pure: skill fit first, verified above
/// unverified inside a fit band, then the buyer agent's deterministic score.
/// Only a verified seller inside the budget can be recommended.

export type RecommendReason = 'best_fit' | 'verified' | 'within_budget' | 'lower_price' | 'on_time_record';

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
}

export const SHORTLIST_MAX = 5;
const ON_TIME_REASON_MIN = 80;
const MAX_REASONS = 3;

export function isVerified(level: Ladder): boolean {
  return level === 'work_verified' || level === 'id_verified';
}

export function rankCandidates(cands: readonly ShortlistCandidate[]): ShortlistCandidate[] {
  return [...cands].sort(
    (a, b) =>
      b.matchBand - a.matchBand ||
      Number(isVerified(b.level)) - Number(isVerified(a.level)) ||
      b.deterministicScore - a.deterministicScore ||
      a.askedUsdc - b.askedUsdc,
  );
}

export function pickRecommended(
  ranked: readonly ShortlistCandidate[],
  budgetUsdc: number,
  unavailable: ReadonlySet<string> = new Set(),
): ShortlistCandidate | null {
  return (
    ranked
      .slice(0, SHORTLIST_MAX)
      .find((c) => isVerified(c.level) && c.askedUsdc <= budgetUsdc && !unavailable.has(c.seller.toLowerCase())) ?? null
  );
}

/// Sellers already marked unavailable, so a refresh keeps them that way.
export function unavailableSellers(entries: readonly ShortlistEntry[]): Set<string> {
  return new Set(entries.filter((e) => e.state === 'unavailable').map((e) => e.seller.toLowerCase()));
}

function reasonsFor(rec: ShortlistCandidate, ranked: readonly ShortlistCandidate[], budgetUsdc: number): RecommendReason[] {
  const out: RecommendReason[] = [];
  if (ranked[0]?.seller === rec.seller) out.push('best_fit');
  out.push('verified');
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
  return ranked.slice(0, SHORTLIST_MAX).map((c, i) => {
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
      reasons: isRec ? reasonsFor(c, ranked, budgetUsdc) : [],
      state: was === 'unavailable' ? 'unavailable' : isRec && agreedPrice === null && was !== 'ready' ? 'negotiating' : 'ready',
      isNew: previous.length > 0 && !seen.has(c.seller.toLowerCase()),
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

export type ShortlistChoice = { ok: true } | { ok: false; code: 'unavailable' | 'unverified-needs-ack' };

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
  if (!entry.verified && !acknowledgeUnverified) return { ok: false, code: 'unverified-needs-ack' };
  return { ok: true };
}

/// What the assistant gets: enough to describe each person and to pass the
/// chosen `seller` (an agent address, never shown) to the choose step.
export function assistantView(entries: readonly ShortlistEntry[]) {
  return [...entries]
    .sort((a, b) => a.rank - b.rank)
    .map((e) => ({
      rank: e.rank,
      seller: e.seller,
      name: e.name,
      tag: e.tag,
      verified: e.verified,
      score: e.score,
      tier: e.tier,
      completedDeals: e.counts.completed,
      onTimePercent: e.counts.onTimeRate,
      disputesLost: e.counts.disputesLost,
      offer: e.offer,
      deliveryDays: e.deliveryDays,
      priceUsdc: e.priceUsdc,
      askedUsdc: e.askedUsdc,
      recordChecked: e.recordChecked,
      recommended: e.recommended,
      reasons: e.reasons,
      available: e.state !== 'unavailable',
    }));
}
