import type { RatingToolDeps } from '../assistant/ratingTools.js';
import { rememberInChat } from '../channels/chatHistory.js';
import { findAgentWalletByAgentAddress } from '../db/agentWallets.js';
import { getDeal, listAllDeals, listDealsForAddress, type DirectDeal } from '../db/deals.js';
import { getRecord, putRecord } from '../db/evidence.js';
import { getProfile } from '../db/profiles.js';
import { ratingsBy, ratingsForDeal, saveRating } from '../db/ratings.js';
import { bus, type KarwanEventType } from '../events.js';
import { logger } from '../logger.js';
import { createRatingAsker, type AskState } from './asker.js';
import { rateableFrom } from './dealState.js';
import { createRatings, type RatedDeal } from './service.js';

const SETTLED_EVENTS = new Set<KarwanEventType>(['escrow.settled', 'deal.auto_released', 'escrow.resolved', 'escrow.split']);
const SWEEP_MS = 60 * 60 * 1000;

const rated = (d: DirectDeal): RatedDeal => rateableFrom(d);

const tagOf = async (address: string) => (await getProfile(address).catch(() => null))?.handle ?? null;

const identityOf = async (address: string) =>
  ((await findAgentWalletByAgentAddress(address).catch(() => null))?.userAddress ?? address).toLowerCase();

export const liveRatingAsker = createRatingAsker({
  now: Date.now,
  recentlySettled: async (since) => (await listAllDeals()).map(rated).filter((d) => d.settledAt !== null && d.settledAt >= since),
  getDeal: async (id) => {
    const d = await getDeal(id).catch(() => null);
    return d ? rated(d) : null;
  },
  getState: (id) => getRecord<AskState>('ratings-asked', id.toLowerCase()),
  putState: (id, state) => putRecord('ratings-asked', id.toLowerCase(), state),
  ratingsForDeal,
  tagOf,
  notify: async (n) => {
    bus.emitEvent({ type: `rating.${n.kind}`, actor: 'platform', payload: { address: n.address, dealId: n.dealId, withTag: n.withTag, text: n.text } });
    await rememberInChat(n.address, `${n.text} (deal ${n.dealId})`).catch(() => {});
  },
});

export const liveRatings = createRatings({
  now: Date.now,
  identityOf,
  getDeal: async (id) => {
    const d = await getDeal(id).catch(() => null);
    return d ? rated(d) : null;
  },
  dealsFor: async (identity) => (await listDealsForAddress(identity).catch(() => [])).map(rated),
  ratingsForDeal,
  ratingsBy,
  save: saveRating,
  tagOf,
  onRated: (dealId) => liveRatingAsker.check(dealId),
});

export const liveRatingToolDeps: RatingToolDeps = {
  rateDeal: liveRatings.rateDeal,
  waiting: liveRatings.waiting,
  hasRated: async (caller, dealId) => {
    const me = await identityOf(caller);
    return (await ratingsForDeal(dealId)).some((r) => r.rater === me);
  },
};

export function startRatingAsker(): () => void {
  const run = () => liveRatingAsker.sweep().catch((err) => logger.warn({ err: (err as Error).message }, 'rating sweep failed'));
  const unsubscribe = bus.subscribe((e) => {
    if (!SETTLED_EVENTS.has(e.type) || !e.jobId) return;
    const id = e.jobId;
    // The deal row records settledAt a moment after the event; the hourly sweep
    // catches anything this misses.
    setTimeout(() => void liveRatingAsker.check(id).catch(() => {}), 15_000).unref?.();
  });
  const timer = setInterval(() => void run(), SWEEP_MS);
  timer.unref?.();
  void run();
  return () => {
    clearInterval(timer);
    unsubscribe();
  };
}
