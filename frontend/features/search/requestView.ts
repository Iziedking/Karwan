import type { BuyerJob, ChainEvent, MatchProposal, NearMissApproval } from '@/core/api';
import type { JobLiveStateProjection } from '@/features/jobs/hooks/jobLiveStateProjection';

export type RequestState =
  | 'funded'
  | 'cancelled'
  | 'expired'
  | 'matchRaised'
  | 'matchShort'
  | 'matchWaitingSeller'
  | 'funding'
  | 'declined'
  | 'nearMiss'
  | 'outOfReach'
  | 'closing'
  | 'negotiating'
  | 'offersArriving'
  | 'looking';

export type RequestAction =
  | 'openDeal'
  | 'acceptMatch'
  | 'raiseMatch'
  | 'declineMatch'
  | 'acceptRaise'
  | 'declineRaise'
  | 'addFunds'
  | 'proceedNearMiss'
  | 'declineNearMiss'
  | 'reconsider'
  | 'editRequest'
  | 'cancelRequest';

export type Viewer = 'buyer' | 'seller';

export interface RequestView {
  state: RequestState;
  viewer: Viewer;
  whoseMove: 'you' | 'them' | 'agent' | 'none';
  primary: RequestAction | null;
  secondary: RequestAction[];
  priceUsdc: string | null;
  wasUsdc: string | null;
  topUpUsdc: string | null;
  overCap: boolean;
  /// Near miss: whether the ask is the viewer's to answer.
  askedYou: boolean;
  showOffers: boolean;
  showTimeline: boolean;
}

/// Only an explicit false marks a seller: an older cached snapshot without the
/// flag belongs to the buyer who posted it.
export function viewerOf(job: BuyerJob): Viewer {
  return job.viewerIsBuyer === false ? 'seller' : 'buyer';
}

/// The one status the request page shows: what is happening, whose move it is,
/// and the single action that moves it on. The seller is the match gate; the
/// buyer only acts on a raise, a near miss that asks them, or a short agent.
export function requestView(input: {
  job: BuyerJob;
  live: Pick<JobLiveStateProjection, 'active' | 'ended' | 'recoverable' | 'outOfReach'>;
  proposal: MatchProposal | null;
  nearMiss: NearMissApproval | null;
  now: number;
}): RequestView {
  const { job, live, proposal, nearMiss, now } = input;
  const viewer = viewerOf(job);
  const buyer = viewer === 'buyer';
  const openActions: RequestAction[] = buyer ? ['editRequest', 'cancelRequest'] : [];
  const base: RequestView = {
    state: 'looking',
    viewer,
    whoseMove: 'agent',
    primary: null,
    secondary: openActions,
    priceUsdc: null,
    wasUsdc: null,
    topUpUsdc: null,
    overCap: false,
    askedYou: false,
    showOffers: buyer && job.bids.length > 0,
    showTimeline: buyer,
  };
  const ended = (state: RequestState): RequestView => ({ ...base, state, whoseMove: 'none', secondary: [] });

  if (job.escrowFunded) return { ...ended('funded'), primary: 'openDeal' };
  if (job.cancelledAt) return ended('cancelled');
  if (job.expiredAt || live.ended === 'expired') return ended('expired');

  const pending = proposal && !proposal.approvedAt && !proposal.declinedAt ? proposal : null;
  if (pending) {
    const price = pending.agreedPriceUsdc;
    if (pending.awaitingParty === 'buyer' && pending.raisedPriceUsdc) {
      // A raise above what the agent holds can only be approved once the buyer
      // adds the gap; offering "Accept" would fail on every press.
      if (pending.fundable === false) {
        return {
          ...base,
          state: 'matchRaised',
          whoseMove: buyer ? 'you' : 'them',
          primary: buyer ? 'addFunds' : null,
          secondary: buyer ? ['declineRaise'] : [],
          priceUsdc: pending.raisedPriceUsdc,
          wasUsdc: pending.originalPriceUsdc ?? price,
          topUpUsdc: pending.topUpNeededUsdc ?? null,
          overCap: pending.raiseOverCap === true,
        };
      }
      return {
        ...base,
        state: 'matchRaised',
        whoseMove: buyer ? 'you' : 'them',
        primary: buyer ? 'acceptRaise' : null,
        secondary: buyer ? ['declineRaise'] : [],
        priceUsdc: pending.raisedPriceUsdc,
        wasUsdc: pending.originalPriceUsdc ?? price,
        overCap: pending.raiseOverCap === true,
      };
    }
    if (pending.fundable === false) {
      return {
        ...base,
        state: 'matchShort',
        whoseMove: buyer ? 'you' : 'them',
        primary: buyer ? 'addFunds' : null,
        secondary: [],
        priceUsdc: price,
        topUpUsdc: pending.topUpNeededUsdc ?? null,
      };
    }
    return {
      ...base,
      state: 'matchWaitingSeller',
      whoseMove: buyer ? 'them' : 'you',
      primary: buyer ? null : 'acceptMatch',
      secondary: buyer ? [] : ['raiseMatch', 'declineMatch'],
      priceUsdc: price,
    };
  }
  if (proposal?.approvedAt) return { ...ended('funding'), priceUsdc: proposal.agreedPriceUsdc };
  if (live.ended === 'declined') return ended('declined');

  const nm = nearMiss && !nearMiss.proceededAt && !nearMiss.declinedAt && nearMiss.expiresAt > now ? nearMiss : null;
  if (nm) {
    const askedYou = nm.askedSide === viewer;
    return {
      ...base,
      state: 'nearMiss',
      whoseMove: askedYou ? 'you' : 'them',
      askedYou,
      primary: askedYou ? 'proceedNearMiss' : null,
      secondary: askedYou ? ['declineNearMiss', ...openActions] : openActions,
      priceUsdc: nm.proceedPriceUsdc,
    };
  }

  if (live.ended === 'out-of-reach') {
    const passed = live.outOfReach?.passedPriceUsdc ?? null;
    return {
      ...base,
      state: 'outOfReach',
      whoseMove: buyer ? 'you' : 'none',
      primary: buyer ? (passed != null ? 'reconsider' : 'editRequest') : null,
      secondary: buyer ? (passed != null ? openActions : ['cancelRequest']) : [],
      priceUsdc: passed != null ? String(passed) : null,
    };
  }

  if (job.deadlineUnix * 1000 < now) return { ...base, state: 'closing', secondary: [] };
  if (live.active === 'counter' || live.recoverable != null) return { ...base, state: 'negotiating' };
  if (job.bids.length > 0 || live.active === 'bidding') return { ...base, state: 'offersArriving' };
  return base;
}

export type RequestLineState =
  | 'funded'
  | 'cancelled'
  | 'expired'
  | 'declined'
  | 'matchFound'
  | 'closing'
  | 'offersArriving'
  | 'looking';

/// A request's state for a list line, from the snapshot alone. `finalized`
/// covers a match that is agreed but not yet funded, so it reads as a match,
/// never as still looking.
export function requestLineState(job: BuyerJob, now: number): RequestLineState {
  if (job.escrowFunded) return 'funded';
  if (job.cancelledAt) return 'cancelled';
  if (job.expiredAt) return 'expired';
  if (job.negotiationEndedAt) return 'declined';
  if (job.finalized) return 'matchFound';
  if (job.deadlineUnix * 1000 < now) return 'closing';
  if (job.bids.length > 0) return 'offersArriving';
  return 'looking';
}

/// The newest event that can change the match, the near miss or the escrow,
/// newest first as the live feed delivers them. The page refetches its
/// proposal and snapshot whenever this changes, so a raise or an approval shows
/// without a reload.
export function refreshKey(events: readonly Pick<ChainEvent, 'eventId' | 'type'>[]): string {
  const hit = events.find(
    (e) =>
      e.type === 'deal.matched' ||
      e.type === 'bid.accepted' ||
      e.type.startsWith('deal.match.') ||
      e.type.startsWith('negotiation.') ||
      e.type.startsWith('escrow.'),
  );
  return hit?.eventId ?? '';
}
