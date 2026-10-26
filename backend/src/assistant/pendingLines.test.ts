import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import type { MatchProposal } from '../db/matchProposals.js';
import { dealPendingLines, proposalPendingLines } from './pendingLines.js';

const ME = '0xme';
const NOW = Date.UTC(2026, 9, 26);
const DAY = 86_400_000;

const proposal = (over: Partial<MatchProposal> = {}): MatchProposal =>
  ({ jobId: '0xjob', buyerUser: '0xbuyer', buyerAgent: '0xba', sellerUser: ME, sellerAgent: '0xsa', agreedPriceUsdc: '30', deadlineUnix: Math.floor((NOW + 3 * DAY) / 1000), termsHash: '0x', proposedAt: NOW - DAY, ...over }) as MatchProposal;

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({ jobId: '0xdeal', buyer: '0xbuyer', seller: ME, dealAmountUsdc: '60', acceptedAt: NOW - 5 * DAY, deadlineUnix: Math.floor((NOW + 10 * DAY) / 1000), createdAt: NOW - 6 * DAY, ...over }) as DirectDeal;

test('a live proposal names the side the person is on', () => {
  const lines = proposalPendingLines(ME, [proposal()], NOW);
  assert.equal(lines.actionNeeded.length, 1);
  assert.match(lines.actionNeeded[0]!, /you are the seller/);
  const asBuyer = proposalPendingLines(ME, [proposal({ buyerUser: ME, sellerUser: '0xother' })], NOW);
  assert.match(asBuyer.waitingOnOthers[0]!, /you are the buyer.*waiting for the seller/);
});

test('a proposal whose request date passed is not something to act on', () => {
  const old = proposal({ deadlineUnix: Math.floor((NOW - 120 * DAY) / 1000) });
  const lines = proposalPendingLines(ME, [old, proposal({ ...old, jobId: '0xjob2' })], NOW);
  assert.deepEqual(lines.actionNeeded, []);
  assert.deepEqual(lines.waitingOnOthers, []);
  assert.equal(lines.expired, 2);
});

test('a delivered deal is the buyer\'s to review and the seller waits on the buyer', () => {
  const asSeller = dealPendingLines(ME, [deal({ delivered: true })], NOW);
  assert.match(asSeller.waitingOnOthers[0]!, /you delivered.*waiting for the buyer/);
  assert.doesNotMatch(asSeller.waitingOnOthers[0]!, /review/);
  const asBuyer = dealPendingLines(ME, [deal({ delivered: true, buyer: ME, seller: '0xs' })], NOW);
  assert.match(asBuyer.actionNeeded[0]!, /review the delivery/);
});

test('a deal on the earlier escrow is never called in progress', () => {
  const lines = dealPendingLines(ME, [deal({ legacyEscrow: true, deadlineUnix: Math.floor((NOW - 150 * DAY) / 1000) })], NOW);
  assert.deepEqual(lines.inFlight, []);
  assert.match(lines.waitingOnOthers.concat(lines.actionNeeded).join(' '), /earlier escrow.*\/legacy/);
});

test('a missed delivery date says who can take the money back', () => {
  const past = Math.floor((NOW - 2 * DAY) / 1000);
  assert.match(dealPendingLines(ME, [deal({ deadlineUnix: past })], NOW).waitingOnOthers[0]!, /delivery date passed.*buyer/);
  assert.match(dealPendingLines(ME, [deal({ deadlineUnix: past, buyer: ME, seller: '0xs' })], NOW).actionNeeded[0]!, /take the money back/);
});

test('a running deal within its date is in progress, and a near date warns the seller', () => {
  assert.match(dealPendingLines(ME, [deal()], NOW).inFlight[0]!, /in progress/);
  const soon = Math.floor((NOW + DAY) / 1000);
  assert.match(dealPendingLines(ME, [deal({ deadlineUnix: soon })], NOW).actionNeeded[0]!, /delivery deadline is in about 1 day/);
});

test('settled and cancelled deals say nothing', () => {
  assert.deepEqual(dealPendingLines(ME, [deal({ settledAt: 1 }), deal({ cancelledAt: 1 })], NOW), { actionNeeded: [], waitingOnOthers: [], inFlight: [] });
});
