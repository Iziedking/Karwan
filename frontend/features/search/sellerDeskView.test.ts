import assert from 'node:assert/strict';
import test from 'node:test';
import type { Listing, MatchProposal, SellerActiveBid, SellerBidOutcome } from '@/core/api';
import { sellerDeskView } from './sellerDeskView';

const ME = '0xME';
const NOW = 10 * 86_400_000;
const match = (over: Partial<MatchProposal> = {}) =>
  ({
    jobId: '0xj1', buyerUser: '0xb', buyerAgent: '0xba', sellerUser: '0xme', sellerAgent: '0xsa',
    agreedPriceUsdc: '96', deadlineUnix: 99_999, termsHash: 'h', proposedAt: 1, ...over,
  }) as MatchProposal;
const liveBid = (over: Partial<SellerActiveBid> = {}): SellerActiveBid => ({
  jobId: '0xj2', seller: '0xsa', jobBuyer: '0xb', budgetUsdc: '100', deadlineUnix: 99_999,
  lastBidPrice: '80', counterRounds: 0, finalized: false, title: 'Menu design', ...over,
});
const outcome = (over: Partial<SellerBidOutcome> = {}): SellerBidOutcome => ({
  jobId: '0xj3', sellerAgent: '0xsa', title: 'Brand refresh', outcome: 'lost', lastPrice: '70', at: 5, ...over,
});
const listing = (over: Partial<Listing> = {}): Listing => ({
  id: 'l1', sellerUser: '0xme', sellerAgent: '0xsa', title: 'Logo design', description: 'd',
  askingPriceUsdc: 90, postedAt: 1, expiresAt: NOW + 12 * 86_400_000, ...over,
});
const desk = (over: Partial<Parameters<typeof sellerDeskView>[0]> = {}) =>
  sellerDeskView({ me: ME, matches: [], bids: [], recentBids: [], listings: [], now: NOW, ...over });

test('needs you holds only matches whose gate is mine', () => {
  const d = desk({
    matches: [
      match(),
      match({ jobId: '0xj9', sellerUser: '0xsomeoneelse' }),
      match({ jobId: '0xj8', raisedPriceUsdc: '120', awaitingParty: 'buyer' }),
      match({ jobId: '0xj7', approvedAt: 3 }),
    ],
    bids: [liveBid({ jobId: '0xj1', title: 'Logo for a bakery' })],
  });
  assert.deepEqual(d.needsYou, [{ jobId: '0xj1', title: 'Logo for a bakery', priceUsdc: '96' }]);
});

test('live bids read offered or negotiating, with my price only', () => {
  const d = desk({
    bids: [liveBid(), liveBid({ jobId: '0xj4', counterRounds: 2, lastBidPrice: '75' }), liveBid({ jobId: '0xj5', finalized: true })],
  });
  assert.deepEqual(
    d.bidding.map((b) => [b.jobId, b.state, b.priceUsdc, b.withdrawable]),
    [
      ['0xj2', 'offered', '80', true],
      ['0xj4', 'negotiating', '75', true],
      ['0xj5', 'offered', '80', false],
    ],
  );
});

test('ended bids come from the recorded outcome, never guessed, and a live bid wins over a record', () => {
  const d = desk({ bids: [liveBid()], recentBids: [outcome(), outcome({ jobId: '0xj2', outcome: 'won' })] });
  assert.deepEqual(d.bidding.map((b) => [b.jobId, b.state]), [['0xj2', 'offered'], ['0xj3', 'lost']]);
});

test('at most ten ended bids show, newest first', () => {
  const recent = Array.from({ length: 15 }, (_, i) => outcome({ jobId: `0xr${i}`, at: i }));
  const d = desk({ recentBids: recent });
  assert.equal(d.bidding.length, 10);
  assert.equal(d.bidding[0].jobId, '0xr14');
});

test('offers show live listings only, with days left', () => {
  const d = desk({
    listings: [listing(), listing({ id: 'l2', cancelledAt: 2 }), listing({ id: 'l3', matchedAt: 2 }), listing({ id: 'l4', expiresAt: NOW - 1 })],
  });
  assert.deepEqual(d.offers, [{ id: 'l1', title: 'Logo design', priceUsdc: 90, daysLeft: 12 }]);
});

test('a seller with nothing is empty, so the form opens', () => {
  assert.equal(desk().empty, true);
  assert.equal(desk({ listings: [listing()] }).empty, false);
});

test('a bid whose brief was lost has no title rather than a hash', () => {
  const d = desk({ bids: [liveBid({ title: null })] });
  assert.equal(d.bidding[0].title, null);
});

test('an older backend with no title field still reads as untitled', () => {
  const legacy = { ...liveBid() } as Partial<SellerActiveBid>;
  delete legacy.title;
  const d = desk({ bids: [legacy as SellerActiveBid] });
  assert.equal(d.bidding[0].title, null);
});

const check = (over: Partial<NonNullable<SellerActiveBid['buyerCheck']>> = {}): NonNullable<SellerActiveBid['buyerCheck']> => ({
  verdict: 'bid', reason: 'record-ok', score: 55, tier: 'ESTABLISHED',
  asBuyer: { completed: 4, unsuccessful: 0, repeatSellers: 1, largestBand: '50to250' },
  disputesLost: 0, paidUsdc: 0.01, receipt: 'r1', checkedAt: 1, ...over,
});

test('a live bid carries what the agent paid to learn about the buyer', () => {
  const d = desk({ bids: [liveBid({ buyerCheck: check({ verdict: 'review', reason: 'first-at-this-size' }) })] });
  assert.deepEqual(d.bidding[0].check, {
    paidUsdc: 0.01, completed: 4, repeatSellers: 1, disputesLost: 0, score: 55,
    flag: 'first-at-this-size', late: false,
  });
});

test('a clean check has no flag, and a bid without a read has no check', () => {
  const d = desk({ bids: [liveBid({ buyerCheck: check() }), liveBid({ jobId: '0xj5' })] });
  assert.equal(d.bidding[0].check?.flag, null);
  assert.equal(d.bidding[1].check, null);
});

test('a request the agent passed on shows as passed with its check', () => {
  const d = desk({ recentBids: [outcome({ outcome: 'passed', lastPrice: '0', buyerCheck: check({ verdict: 'pass', reason: 'disputes', disputesLost: 3 }) })] });
  assert.equal(d.bidding[0].state, 'passed');
  assert.equal(d.bidding[0].check?.flag, 'disputes');
  assert.equal(d.bidding[0].check?.disputesLost, 3);
});

test('buyers waiting on my World ID check are carried to the desk and count as something to do', () => {
  const d = desk({ worldChecks: [{ jobId: '0xj9', title: 'Logo', priceUsdc: '1200', reason: 'large_deal', skipAllowed: true }] });
  assert.equal(d.worldChecks.length, 1);
  assert.equal(d.empty, false);
});
