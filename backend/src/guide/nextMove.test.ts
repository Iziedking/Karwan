import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import type { MatchProposal } from '../db/matchProposals.js';
import { nextMoves, type NextMoveInput } from './nextMove.js';

const ME = '0x00000000000000000000000000000000000000aa';
const THEM = '0x00000000000000000000000000000000000000bb';
const NOW = Date.parse('2026-11-06T12:00:00Z');
const DAY = 86_400;

const deal = (over: Partial<DirectDeal>): DirectDeal =>
  ({ jobId: '0xdeal1', buyer: ME, seller: THEM, dealAmountUsdc: '100', createdAt: NOW - 1000, ...over }) as DirectDeal;

const proposal = (over: Partial<MatchProposal>): MatchProposal =>
  ({ jobId: '0xjob1', buyerUser: ME, agreedPriceUsdc: '40', deadlineUnix: NOW / 1000 + 5 * DAY, awaitingParty: 'buyer', ...over }) as MatchProposal;

const input = (over: Partial<NextMoveInput>): NextMoveInput => ({
  address: ME,
  deals: [],
  proposals: [],
  requestsWithOffers: [],
  postedAnything: true,
  statementOpen: () => true,
  now: NOW,
  ...over,
});

const kinds = (i: NextMoveInput) => nextMoves(i).map((m) => m.kind);

test('a buyer whose seller delivered is asked to check and approve, with a link to the deal', () => {
  const [m] = nextMoves(input({ deals: [deal({ acceptedAt: NOW - 5000, delivered: true } as Partial<DirectDeal>)] }));
  assert.equal(m?.kind, 'approve_delivery');
  assert.equal(m?.href, '/deals/0xdeal1');
  assert.equal(m?.amountUsdc, '100');
});

test('the seller of a delivered deal has nothing to do', () => {
  assert.deepEqual(kinds(input({ address: THEM, deals: [deal({ acceptedAt: NOW - 5000, delivered: true } as Partial<DirectDeal>)] })), []);
});

test('the buyer funds once the seller agreed, but never on a deal the agent funds', () => {
  assert.deepEqual(kinds(input({ deals: [deal({ sellerApprovedAt: NOW - 10 } as Partial<DirectDeal>)] })), ['fund_deal']);
  assert.deepEqual(kinds(input({ deals: [deal({ sellerApprovedAt: NOW - 10, origin: 'agent' } as Partial<DirectDeal>)] })), []);
});

test('the seller agrees to terms a buyer sent, but not while still invited', () => {
  assert.deepEqual(kinds(input({ address: THEM, deals: [deal({})] })), ['agree_terms']);
  assert.deepEqual(kinds(input({ address: THEM, deals: [deal({ pendingCounterparty: { email: 'x@y.z' } } as unknown as Partial<DirectDeal>)] })), []);
});

test('a seller due within three days is told how many days are left', () => {
  const due = deal({ acceptedAt: NOW - 5000, deadlineUnix: NOW / 1000 + 2 * DAY - 60 } as Partial<DirectDeal>);
  const [m] = nextMoves(input({ address: THEM, deals: [due] }));
  assert.equal(m?.kind, 'deliver_soon');
  assert.equal(m?.days, 2);
  assert.deepEqual(kinds(input({ address: THEM, deals: [deal({ acceptedAt: NOW - 5000, deadlineUnix: NOW / 1000 + 6 * DAY } as Partial<DirectDeal>)] })), []);
});

test('a passed date with nothing delivered lets the buyer see options', () => {
  const late = deal({ acceptedAt: NOW - 9000, deadlineUnix: NOW / 1000 - DAY } as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [late] })), ['take_back']);
});

test('requests to cancel or extend go to the side that has to answer', () => {
  const cancel = deal({ acceptedAt: NOW - 1, cancellationProposal: { proposedBy: 'seller', reason: 'r' } } as unknown as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [cancel] })), ['answer_cancel']);
  assert.deepEqual(kinds(input({ address: THEM, deals: [cancel] })), []);
  const ext = deal({ acceptedAt: NOW - 1, extensionRequest: { additionalSeconds: 2 * DAY } } as unknown as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [ext] })), ['answer_extension']);
});

test('a dispute asks for a statement only while the window is open and none was given', () => {
  const d = deal({ acceptedAt: NOW - 1, disputed: true } as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [d] })), ['dispute_statement']);
  assert.deepEqual(kinds(input({ deals: [d], statementOpen: () => false })), []);
  const said = deal({ acceptedAt: NOW - 1, disputed: true, disputeStatements: { buyer: { text: 'x' } } } as unknown as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [said] })), []);
});

test('settled, cancelled and old-escrow deals never ask for anything', () => {
  for (const over of [{ settledAt: NOW }, { cancelledAt: NOW }, { legacyEscrow: true }]) {
    assert.deepEqual(kinds(input({ deals: [deal({ delivered: true, acceptedAt: 1, ...over } as Partial<DirectDeal>)] })), []);
  }
});

test('a match waiting on me is approved or declined; an expired one is ignored', () => {
  const [m] = nextMoves(input({ proposals: [proposal({ raisedPriceUsdc: '45' })] }));
  assert.equal(m?.kind, 'approve_match');
  assert.equal(m?.href, '/jobs/0xjob1');
  assert.equal(m?.amountUsdc, '45');
  assert.deepEqual(kinds(input({ proposals: [proposal({ deadlineUnix: NOW / 1000 - 10 })] })), []);
  assert.deepEqual(kinds(input({ proposals: [proposal({ awaitingParty: 'seller' })] })), []);
  assert.deepEqual(kinds(input({ proposals: [proposal({ approvedAt: NOW } as Partial<MatchProposal>)] })), []);
});

test('offers on a request are compared, unless a match for it already waits', () => {
  const [m] = nextMoves(input({ requestsWithOffers: [{ jobId: '0xjob2', offers: 3 }] }));
  assert.equal(m?.kind, 'choose_offer');
  assert.equal(m?.count, 3);
  assert.deepEqual(kinds(input({ proposals: [proposal({ jobId: '0xjob2' })], requestsWithOffers: [{ jobId: '0xjob2', offers: 3 }] })), ['approve_match']);
});

test('moves come most urgent first', () => {
  const ks = kinds(input({
    deals: [
      deal({ jobId: '0xa', sellerApprovedAt: 1 } as Partial<DirectDeal>),
      deal({ jobId: '0xb', acceptedAt: 1, delivered: true } as Partial<DirectDeal>),
    ],
    requestsWithOffers: [{ jobId: '0xjob3', offers: 1 }],
  }));
  assert.deepEqual(ks, ['approve_delivery', 'fund_deal', 'choose_offer']);
});

test('one move per deal, the most urgent', () => {
  const d = deal({ acceptedAt: NOW - 1, delivered: true, cancellationProposal: { proposedBy: 'seller', reason: 'r' } } as unknown as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [d] })), ['approve_delivery']);
});

test('someone with nothing yet is asked to start; anyone with anything is not', () => {
  assert.deepEqual(kinds(input({ postedAnything: false })), ['first_post']);
  assert.deepEqual(kinds(input({ postedAnything: false, deals: [deal({ acceptedAt: 1 } as Partial<DirectDeal>)] })), []);
  assert.deepEqual(kinds(input({ postedAnything: true })), []);
});

test('addresses match whatever their casing', () => {
  const d = deal({ buyer: ME.toUpperCase().replace('0X', '0x'), acceptedAt: 1, delivered: true } as Partial<DirectDeal>);
  assert.deepEqual(kinds(input({ deals: [d] })), ['approve_delivery']);
});

test('an agreed local amount travels with the move', () => {
  const local = { currency: 'NGN', amount: '150000', rate: '1500', at: NOW };
  const [m] = nextMoves(input({ deals: [deal({ acceptedAt: 1, delivered: true, agreedLocal: local } as unknown as Partial<DirectDeal>)] }));
  assert.deepEqual(m?.agreedLocal, local);
});
