import type { BuyerJob, Listing } from '@/core/api';
import type { DealStage } from '@/features/deals/components/DirectDealList';
import { isYourMove } from '@/features/notifications/dealNextStep';
import { requestLineState } from '@/features/search/requestView';

const OPEN_REQUEST = new Set(['looking', 'offersArriving', 'matchFound', 'closing']);

/// Requests still looking, the latest deadline first.
export function openRequests(requests: BuyerJob[], now: number): BuyerJob[] {
  return requests.filter((job) => OPEN_REQUEST.has(requestLineState(job, now))).sort((a, b) => b.deadlineUnix - a.deadlineUnix);
}

/// Offers still on the market, newest first.
export function liveOffers(listings: Listing[], now: number): Listing[] {
  return listings.filter((l) => !l.matchedAt && !l.cancelledAt && l.expiresAt > now).sort((a, b) => b.postedAt - a.postedAt);
}

/// What the Trade hub counts: live trades and how many wait on you, requests
/// still looking with the offers they have drawn, and offers still on the market.
export function tradeHubSummary(input: {
  me: string;
  trades: Array<{ stage: DealStage; isBuyer: boolean }>;
  requests: BuyerJob[];
  listings: Listing[];
  now: number;
}) {
  const live = input.trades.filter((t) => t.stage !== 'settled' && t.stage !== 'cancelled');
  const open = openRequests(input.requests, input.now);
  return {
    trades: { active: live.length, yourMove: live.filter((t) => isYourMove(t.stage, t.isBuyer)).length },
    requests: { open: open.length, offers: open.reduce((n, job) => n + job.bids.length, 0) },
    offers: { live: liveOffers(input.listings, input.now).length },
  };
}
