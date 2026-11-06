import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshFundability } from './matchFundability.js';
import type { MatchProposal } from '../db/matchProposals.js';

const short = {
  jobId: '0xjob', buyerUser: '0xb', buyerAgent: '0xagent', sellerUser: '0xs', sellerAgent: '0xsa',
  agreedPriceUsdc: '84', fundable: false, agentBalanceUsdc: '80', fundedAmountUsdc: '84.70985', topUpNeededUsdc: '4.70985',
} as unknown as MatchProposal;

test('after a top-up the match reads as fundable and the shortfall clears', async () => {
  const next = await refreshFundability(short, async () => 90_000_000n);
  assert.equal(next?.fundable, true);
  assert.equal(next?.topUpNeededUsdc, '0');
  assert.equal(next?.agentBalanceUsdc, '90');
});

test('still short after a small top-up: the gap is what is left', async () => {
  const next = await refreshFundability(short, async () => 82_000_000n);
  assert.equal(next?.fundable, false);
  assert.equal(next?.topUpNeededUsdc, '2.70985');
});

test('nothing to refresh on a fundable, approved, declined or unread match, or when the read fails', async () => {
  assert.equal(await refreshFundability({ ...short, fundable: true } as MatchProposal, async () => 0n), null);
  assert.equal(await refreshFundability({ ...short, approvedAt: 1 } as MatchProposal, async () => 99_000_000n), null);
  assert.equal(await refreshFundability({ ...short, declinedAt: 1 } as MatchProposal, async () => 99_000_000n), null);
  assert.equal(await refreshFundability({ ...short, fundedAmountUsdc: undefined } as MatchProposal, async () => 99_000_000n), null);
  assert.equal(await refreshFundability(short, async () => { throw new Error('rpc'); }), null);
  assert.equal(await refreshFundability({ ...short, awaitingParty: 'buyer', raisedPriceUsdc: '90' } as MatchProposal, async () => 99_000_000n), null);
  // The same balance as stored changes nothing.
  assert.equal(await refreshFundability(short, async () => 80_000_000n), null);
});
