import type { BuyerJob, Listing } from '@/core/api';
import type { DealStage } from '@/features/deals/components/DirectDealList';
import { isYourMove } from '@/features/notifications/dealNextStep';
import { requestLineState } from '@/features/search/requestView';

const OPEN_REQUEST = new Set(['looking', 'offersArriving', 'matchFound', 'closing']);

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
  const open = input.requests.filter((job) => OPEN_REQUEST.has(requestLineState(job, input.now)));
  return {
    trades: { active: live.length, yourMove: live.filter((t) => isYourMove(t.stage, t.isBuyer)).length },
    requests: { open: open.length, offers: open.reduce((n, job) => n + job.bids.length, 0) },
    offers: { live: input.listings.filter((l) => !l.matchedAt && !l.cancelledAt && l.expiresAt > input.now).length },
  };
}
