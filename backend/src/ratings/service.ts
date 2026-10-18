import { holdNote, isRevealed, mayRate, REVEAL_AFTER_MS, type DealRating } from './rules.js';

/// Rating a settled deal. The assistant tool and the site route both rate
/// through here, so the identity rule and the blind reveal are the same
/// everywhere.

export interface RatedDeal {
  jobId: string;
  buyer: string;
  seller: string;
  settledAt: number | null;
  dispute?: 'buyer' | 'seller' | 'split' | null;
}

export interface RatingDeps {
  now: () => number;
  /// The person behind an address: an agent wallet resolves to its owner.
  identityOf: (address: string) => Promise<string>;
  getDeal: (dealId: string) => Promise<RatedDeal | null>;
  dealsFor: (identity: string) => Promise<RatedDeal[]>;
  ratingsForDeal: (dealId: string) => Promise<DealRating[]>;
  ratingsBy: (identity: string) => Promise<DealRating[]>;
  save: (rating: DealRating) => Promise<boolean>;
  tagOf: (address: string) => Promise<string | null>;
  /// Called after each saved rating, so the reveal can be announced.
  onRated: (dealId: string) => Promise<void>;
}

export type RateResult = { ok: true; revealed: boolean; message: string } | { ok: false; message: string };

const NOTE_MAX = 280;
const REFUSED = {
  not_party: 'Only the two people in this deal can rate it.',
  not_settled: 'You can rate this deal once it settles.',
  already_rated: 'You already rated this deal.',
} as const;

export function createRatings(deps: RatingDeps) {
  async function rateDeal(caller: string, dealId: string, stars: number, note?: string): Promise<RateResult> {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, message: 'Rate it from 1 to 5.' };
    const deal = await deps.getDeal(dealId);
    if (!deal) return { ok: false, message: 'No deal with that id.' };
    const rater = (await deps.identityOf(caller)).toLowerCase();
    const existing = await deps.ratingsForDeal(deal.jobId);
    const may = mayRate(deal, rater, existing);
    if (!may.ok) return { ok: false, message: REFUSED[may.reason] };
    // Blind until both rate or 14 days pass, so rating closes when the blind
    // would end; a late rating would show at once, before the other side rates.
    if (deps.now() - deal.settledAt! >= REVEAL_AFTER_MS) return { ok: false, message: 'Ratings for this deal closed 14 days after it settled.' };
    const text = note?.trim().slice(0, NOTE_MAX) || null;
    const noteHeld = !!text && holdNote(text);
    const now = deps.now();
    const saved = await deps.save({
      dealId: deal.jobId,
      rater,
      ratee: may.ratee,
      stars: stars as DealRating['stars'],
      note: text,
      noteHeld,
      settledAt: deal.settledAt!,
      createdAt: now,
      dispute: deal.dispute ?? null,
    });
    if (!saved) return { ok: false, message: REFUSED.already_rated };
    await deps.onRated(deal.jobId).catch(() => {});
    const revealed = isRevealed(await deps.ratingsForDeal(deal.jobId), deal.settledAt!, now);
    const held = noteHeld ? ' Your note has contact details, so it stays private.' : '';
    return { ok: true, revealed, message: `Saved.${held}` };
  }

  async function waiting(caller: string): Promise<Array<{ dealId: string; withTag: string | null; settledAt: number }>> {
    const me = (await deps.identityOf(caller)).toLowerCase();
    const done = new Set((await deps.ratingsBy(me)).map((r) => r.dealId.toLowerCase()));
    const now = deps.now();
    const deals = (await deps.dealsFor(me)).filter(
      (d) => d.settledAt !== null && now - d.settledAt < REVEAL_AFTER_MS && !done.has(d.jobId.toLowerCase()),
    );
    return Promise.all(
      deals.map(async (d) => {
        const other = d.buyer.toLowerCase() === me ? d.seller : d.buyer;
        return { dealId: d.jobId, withTag: await deps.tagOf(other), settledAt: d.settledAt! };
      }),
    );
  }

  return { rateDeal, waiting };
}
