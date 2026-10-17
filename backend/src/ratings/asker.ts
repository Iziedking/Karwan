import { isRevealed, REVEAL_AFTER_MS, type DealRating } from './rules.js';
import type { RatedDeal } from './service.js';

/// Asks both people to rate a deal once it settles, reminds once after three
/// days, and tells each person when the other's rating of them shows. Works
/// from the deals themselves, so a replayed or early settlement event never
/// asks twice or asks about a deal that has not settled.

export interface AskState {
  askedAt?: number;
  remindedAt?: number;
  revealedTo?: string[];
}

export interface RatingNotice {
  kind: 'requested' | 'reminder' | 'revealed';
  address: string;
  dealId: string;
  withTag: string | null;
  text: string;
}

export interface AskerDeps {
  now: () => number;
  /// Deals settled in the window worth asking about.
  recentlySettled: (since: number) => Promise<RatedDeal[]>;
  getDeal: (dealId: string) => Promise<RatedDeal | null>;
  getState: (dealId: string) => Promise<AskState | null>;
  putState: (dealId: string, state: AskState) => Promise<void>;
  ratingsForDeal: (dealId: string) => Promise<DealRating[]>;
  tagOf: (address: string) => Promise<string | null>;
  notify: (notice: RatingNotice) => Promise<void>;
}

const DAY = 24 * 60 * 60 * 1000;
const REMIND_AFTER = 3 * DAY;
/// A day past the reveal, so a lone rating's reveal is still announced.
const WINDOW = REVEAL_AFTER_MS + DAY;

const name = (tag: string | null) => (tag ? `@${tag}` : 'a Karwan member');

const TEXT = {
  requested: (tag: string | null) => `How did your deal with ${name(tag)} go? Rate it 1 to 5, and add a note if you like.`,
  reminder: (tag: string | null) => `A reminder to rate your deal with ${name(tag)} from 1 to 5. Ratings show once you both rate, or 14 days after the deal settled.`,
  revealed: (tag: string | null) => `${tag ? `@${tag}'s` : 'Their'} rating of you is in.`,
};

export function createRatingAsker(deps: AskerDeps) {
  async function handle(deal: RatedDeal): Promise<void> {
    if (deal.settledAt === null) return;
    const now = deps.now();
    if (now - deal.settledAt > WINDOW) return;
    const before = (await deps.getState(deal.jobId)) ?? {};
    const state: AskState = { ...before, revealedTo: [...(before.revealedTo ?? [])] };
    const ratings = await deps.ratingsForDeal(deal.jobId);
    const rated = new Set(ratings.map((r) => r.rater.toLowerCase()));
    const parties = [deal.buyer.toLowerCase(), deal.seller.toLowerCase()];
    const other = (me: string) => parties.find((p) => p !== me)!;
    const tell = async (kind: RatingNotice['kind'], address: string) => {
      const withTag = await deps.tagOf(other(address));
      await deps.notify({ kind, address, dealId: deal.jobId, withTag, text: TEXT[kind](withTag) });
    };
    let changed = false;

    if (!state.askedAt) {
      for (const p of parties) if (!rated.has(p)) await tell('requested', p);
      state.askedAt = now;
      changed = true;
    } else if (!state.remindedAt && rated.size < 2 && now - deal.settledAt >= REMIND_AFTER && now - state.askedAt >= REMIND_AFTER) {
      for (const p of parties) if (!rated.has(p)) await tell('reminder', p);
      state.remindedAt = now;
      changed = true;
    }

    if (isRevealed(ratings, deal.settledAt, now)) {
      for (const p of parties) {
        if (state.revealedTo!.includes(p) || !ratings.some((r) => r.ratee.toLowerCase() === p)) continue;
        await tell('revealed', p);
        state.revealedTo!.push(p);
        changed = true;
      }
    }
    if (changed) await deps.putState(deal.jobId, state);
  }

  return {
    async sweep(): Promise<void> {
      for (const deal of await deps.recentlySettled(deps.now() - WINDOW)) {
        await handle(deal).catch(() => {});
      }
    },
    async check(dealId: string): Promise<void> {
      const deal = await deps.getDeal(dealId);
      if (deal) await handle(deal);
    },
  };
}
