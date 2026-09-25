import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuyerBid, MatchProposal, NearMissApproval } from '@/core/api';
import { makeBuyerJob } from '@/features/jobs/hooks/jobLiveStateProjection.fixtures';
import { requestView } from './requestView';

const NOW = 1_000_000;
const live = { active: 'posted' as const, ended: null, recoverable: null, outOfReach: null };
const bid: BuyerBid = {
  seller: '0xs', priceUsdc: '96', deadlineUnix: 5_000, score: null, suggestedCounterPrice: null,
  suggestedCounterDeadlineDays: null, sellerTier: null, sellerUserAddress: '0xsu', sellerDisplayName: 'Ada', topicalMatch: 92,
} as BuyerBid;

function proposal(over: Partial<MatchProposal> = {}): MatchProposal {
  return {
    jobId: 'job-1', buyerUser: '0xbu', buyerAgent: '0xba', sellerUser: '0xsu', sellerAgent: '0xsa',
    agreedPriceUsdc: '96', deadlineUnix: 5_000, termsHash: 'h', proposedAt: 1, ...over,
  } as MatchProposal;
}
function nearMiss(over: Partial<NearMissApproval> = {}): NearMissApproval {
  return {
    jobId: 'job-1', buyerUser: '0xbu', buyerAgent: '0xba', sellerUser: '0xsu', sellerAgent: '0xsa',
    askedSide: 'buyer', askedUser: '0xbu', proceedPriceUsdc: '130', limitUsdc: '120', gapUsdc: '10',
    buyerCeilingUsdc: '120', sellerFloorUsdc: '130', createdAt: 1, expiresAt: NOW + 60_000, ...over,
  };
}
const job = (over = {}) => makeBuyerJob({ deadlineUnix: 5_000, viewerIsBuyer: true, ...over });
const view = (over: Partial<Parameters<typeof requestView>[0]> = {}) =>
  requestView({ job: job(), live, proposal: null, nearMiss: null, now: NOW, ...over });

test('a new request is looking, with edit and cancel only', () => {
  const v = view();
  assert.equal(v.state, 'looking');
  assert.equal(v.primary, null);
  assert.deepEqual(v.secondary, ['editRequest', 'cancelRequest']);
  assert.equal(v.whoseMove, 'agent');
});

test('offers arriving and negotiating come from bids and the live stage', () => {
  assert.equal(view({ job: job({ bids: [bid] }) }).state, 'offersArriving');
  assert.equal(view({ live: { ...live, active: 'counter' } }).state, 'negotiating');
  assert.equal(view({ live: { ...live, recoverable: 'temporary_impasse' } }).state, 'negotiating');
});

test('past the deadline with no expiry record reads closing, never expired or failed', () => {
  const v = view({ now: 5_001_000 });
  assert.equal(v.state, 'closing');
  assert.equal(v.primary, null);
});

test('the seller is the gate: a fresh match leaves the buyer with no primary', () => {
  const v = view({ proposal: proposal() });
  assert.equal(v.state, 'matchWaitingSeller');
  assert.equal(v.primary, null);
  assert.equal(v.whoseMove, 'them');
  assert.equal(v.priceUsdc, '96');
});

test('the matched seller accepts, asks for more or declines', () => {
  const v = view({ job: job({ viewerIsBuyer: false, bids: [] }), proposal: proposal() });
  assert.equal(v.state, 'matchWaitingSeller');
  assert.equal(v.primary, 'acceptMatch');
  assert.deepEqual(v.secondary, ['raiseMatch', 'declineMatch']);
  assert.equal(v.whoseMove, 'you');
});

test('a raise hands the gate to the buyer, and says when it is over the budget', () => {
  const raised = proposal({ raisedPriceUsdc: '130', originalPriceUsdc: '96', awaitingParty: 'buyer', raiseOverCap: true });
  const v = view({ proposal: raised });
  assert.equal(v.state, 'matchRaised');
  assert.equal(v.primary, 'acceptRaise');
  assert.deepEqual(v.secondary, ['declineRaise']);
  assert.equal(v.priceUsdc, '130');
  assert.equal(v.wasUsdc, '96');
  assert.equal(v.overCap, true);
  const seller = view({ job: job({ viewerIsBuyer: false }), proposal: raised });
  assert.equal(seller.primary, null);
  assert.equal(seller.whoseMove, 'them');
});

test('a short agent asks the buyer to add the exact amount', () => {
  const v = view({ proposal: proposal({ fundable: false, topUpNeededUsdc: '12.5' }) });
  assert.equal(v.state, 'matchShort');
  assert.equal(v.primary, 'addFunds');
  assert.equal(v.topUpUsdc, '12.5');
  const seller = view({ job: job({ viewerIsBuyer: false }), proposal: proposal({ fundable: false, topUpNeededUsdc: '12.5' }) });
  assert.equal(seller.primary, null);
});

test('an approved match waiting on escrow is funding, never failed', () => {
  const v = view({ proposal: proposal({ approvedAt: 5 }) });
  assert.equal(v.state, 'funding');
  assert.equal(v.primary, null);
  assert.equal(v.whoseMove, 'none');
});

test('a funded request hands over to the deal page first of all', () => {
  const v = view({ job: job({ escrowFunded: true, cancelledAt: 1 }), proposal: proposal({ approvedAt: 5 }) });
  assert.equal(v.state, 'funded');
  assert.equal(v.primary, 'openDeal');
});

test('cancelled beats expired beats everything open', () => {
  assert.equal(view({ job: job({ cancelledAt: 1, expiredAt: 2 }) }).state, 'cancelled');
  assert.equal(view({ job: job({ expiredAt: 2 }), proposal: proposal() }).state, 'expired');
  assert.equal(view({ live: { ...live, ended: 'expired' } }).state, 'expired');
});

test('a near miss belongs to the side it asks', () => {
  const mine = view({ nearMiss: nearMiss() });
  assert.equal(mine.state, 'nearMiss');
  assert.equal(mine.primary, 'proceedNearMiss');
  assert.deepEqual(mine.secondary, ['declineNearMiss', 'editRequest', 'cancelRequest']);
  assert.equal(mine.priceUsdc, '130');
  const theirs = view({ nearMiss: nearMiss({ askedSide: 'seller', askedUser: '0xsu' }) });
  assert.equal(theirs.primary, null);
  assert.equal(theirs.whoseMove, 'them');
  const lapsed = view({ nearMiss: nearMiss({ expiresAt: NOW - 1 }) });
  assert.equal(lapsed.state, 'looking');
});

test('out of reach offers to reconsider the passed price when there is one', () => {
  const v = view({ live: { ...live, ended: 'out-of-reach', outOfReach: { closestFloorUsdc: 300, ceilingUsdc: 120, passedPriceUsdc: 130 } } });
  assert.equal(v.state, 'outOfReach');
  assert.equal(v.primary, 'reconsider');
  assert.equal(v.priceUsdc, '130');
  const none = view({ live: { ...live, ended: 'out-of-reach', outOfReach: { closestFloorUsdc: 300, ceilingUsdc: 120, passedPriceUsdc: null } } });
  assert.equal(none.primary, 'editRequest');
});

test('declined ends the request', () => {
  assert.equal(view({ live: { ...live, ended: 'declined' } }).state, 'declined');
});

test('a seller never gets offers or the timeline, whatever the data says', () => {
  const v = view({ job: job({ viewerIsBuyer: false, bids: [bid] }), proposal: proposal() });
  assert.equal(v.showOffers, false);
  assert.equal(v.showTimeline, false);
  const buyer = view({ job: job({ bids: [bid] }) });
  assert.equal(buyer.showOffers, true);
  assert.equal(buyer.showTimeline, true);
});

test('an older cached snapshot without the flag is read as the buyer', () => {
  const v = view({ job: makeBuyerJob({ deadlineUnix: 5_000 }) });
  assert.equal(v.viewer, 'buyer');
});

test('a list line reads the snapshot honestly, including a match waiting on funding', async () => {
  const { requestLineState } = await import('./requestView');
  assert.equal(requestLineState(job({ escrowFunded: true }), NOW), 'funded');
  assert.equal(requestLineState(job({ cancelledAt: 1 }), NOW), 'cancelled');
  assert.equal(requestLineState(job({ expiredAt: 1 }), NOW), 'expired');
  assert.equal(requestLineState(job({ negotiationEndedAt: 1 }), NOW), 'declined');
  assert.equal(requestLineState(job({ finalized: true }), NOW), 'matchFound');
  assert.equal(requestLineState(job(), 5_001_000), 'closing');
  assert.equal(requestLineState(job({ bids: [bid] }), NOW), 'offersArriving');
  assert.equal(requestLineState(job(), NOW), 'looking');
});

test('a raise the agent cannot cover asks the buyer to add the exact amount, not to accept', () => {
  const v = view({
    proposal: proposal({ raisedPriceUsdc: '130', originalPriceUsdc: '96', awaitingParty: 'buyer', fundable: false, topUpNeededUsdc: '9.5' }),
  });
  assert.equal(v.state, 'matchRaised');
  assert.equal(v.primary, 'addFunds');
  assert.deepEqual(v.secondary, ['declineRaise']);
  assert.equal(v.topUpUsdc, '9.5');
  assert.equal(v.priceUsdc, '130');
});

test('the page refreshes on any new match, near-miss or escrow event, and only then', async () => {
  const { refreshKey } = await import('./requestView');
  const ev = (eventId: string, type: string) => ({ eventId, type, jobId: 'job-1', actor: 'platform', ts: 1, payload: {} });
  assert.equal(refreshKey([]), '');
  assert.equal(refreshKey([ev('a', 'bid.submitted')]), '');
  assert.equal(refreshKey([ev('b', 'deal.match.raised'), ev('a', 'deal.matched')]), 'b');
  assert.equal(refreshKey([ev('c', 'bid.submitted'), ev('b', 'negotiation.near_miss')]), 'b');
  assert.equal(refreshKey([ev('d', 'escrow.funded')]), 'd');
});
