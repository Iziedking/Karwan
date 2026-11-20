import type { BuyerJob, ContestView, Listing, WorkRequestView, WorkRow } from '@/core/api';
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

const CONTEST_OPEN = new Set(['open', 'awarding']);
const CONTEST_DECIDED = new Set(['awarded', 'cancelled', 'returned']);
const WORK_UNDER_WAY = new Set(['offering', 'offered', 'active', 'ending']);

/// Contests you posted that are still open, and ones you entered that are not
/// decided; flagged when entries wait on you or a result is in (view 96).
export function contestCounts(c: { posted: ContestView[]; entered: ContestView[] }) {
  const posted = c.posted.filter((x) => CONTEST_OPEN.has(x.status));
  const entered = c.entered.filter((x) => !CONTEST_DECIDED.has(x.status));
  return {
    open: posted.length + entered.length,
    entriesIn: posted.filter((x) => x.entries > 0).length,
    decided: c.entered.filter((x) => CONTEST_DECIDED.has(x.status)).length,
  };
}

/// Hourly and monthly work you posted or offered on that is still open, and
/// work under way; flagged when work offered to you waits on your yes (view 96).
export function workCounts(w: { posted: WorkRequestView[]; offered: WorkRequestView[]; work: WorkRow[] }) {
  const underWay = w.work.filter((x) => WORK_UNDER_WAY.has(x.status));
  return {
    open: w.posted.filter((x) => x.status === 'open').length + w.offered.filter((x) => x.status === 'open').length + underWay.length,
    waiting: underWay.filter((x) => x.status === 'offered' && x.role === 'worker').length,
  };
}

/// What the Trade hub counts: live trades and how many wait on you, requests
/// still looking with the offers they have drawn, offers still on the market,
/// contests and work (view 96).
export function tradeHubSummary(input: {
  me: string;
  trades: Array<{ stage: DealStage; isBuyer: boolean }>;
  requests: BuyerJob[];
  listings: Listing[];
  contests?: { posted: ContestView[]; entered: ContestView[] };
  work?: { posted: WorkRequestView[]; offered: WorkRequestView[]; work: WorkRow[] };
  now: number;
}) {
  const live = input.trades.filter((t) => t.stage !== 'settled' && t.stage !== 'cancelled');
  const open = openRequests(input.requests, input.now);
  return {
    trades: { active: live.length, yourMove: live.filter((t) => isYourMove(t.stage, t.isBuyer)).length },
    requests: { open: open.length, offers: open.reduce((n, job) => n + job.bids.length, 0) },
    offers: { live: liveOffers(input.listings, input.now).length },
    contests: contestCounts(input.contests ?? { posted: [], entered: [] }),
    work: workCounts(input.work ?? { posted: [], offered: [], work: [] }),
  };
}
