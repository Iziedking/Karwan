import assert from 'node:assert/strict';
import test from 'node:test';
import type { MatchProposal } from '../db/matchProposals.js';
import { publicRequestOf, publicRequests, type PublicRequestDeps } from './publicRequests.js';
import { AGREED_LISTED_MS } from './requestState.js';

///   npx tsx --test src/market/publicRequests.test.ts

const NOW = 100 * AGREED_LISTED_MS;

function row(jobId: string, postedAt: number, extra: { finalized?: boolean; escrowFunded?: boolean } = {}) {
  return {
    jobId, buyer: '0xb', budgetUsdc: '100', deadlineUnix: 1, briefText: jobId, quantity: null, bidsCount: 0, postedAt,
    tradeLane: 'service' as const, partyKind: 'person' as const, example: false,
    finalized: extra.finalized ?? false, escrowFunded: extra.escrowFunded ?? false, bids: [],
  };
}

function proposal(seller: string, extra: Partial<MatchProposal>): MatchProposal {
  return { jobId: 'x', buyerUser: '0xb', buyerAgent: '0xba', sellerUser: seller, sellerAgent: '0xsa', agreedPriceUsdc: '90', deadlineUnix: 1, termsHash: '0x', proposedAt: NOW - 10, ...extra } as MatchProposal;
}

const proposals: Record<string, MatchProposal> = {
  neg: proposal('0xSELLER', {}),
  agreedNew: proposal('0xs2', { approvedAt: NOW - 1000 }),
  agreedOld: proposal('0xs3', { approvedAt: NOW - AGREED_LISTED_MS - 1 }),
  declined: proposal('0xs4', { declinedAt: NOW - 5 }),
};

const deps: PublicRequestDeps = {
  rows: () => [
    row('open', 1),
    row('neg', 5, { finalized: true }),
    row('agreedNew', 9, { finalized: true }),
    row('agreedOld', 7, { finalized: true }),
    row('declined', 3, { finalized: true }),
    row('open2', 8),
  ],
  proposal: async (jobId) => proposals[jobId] ?? null,
  hasDeal: async () => false,
  nearMiss: () => false,
  nowMs: () => NOW,
};

test('the market lists open, then in negotiation, then agreed within 7 days; ended and old agreed requests leave', async () => {
  const out = await publicRequests(deps);
  assert.deepEqual(out.map((r) => [r.jobId, r.state]), [
    ['open2', 'open'],
    ['open', 'open'],
    ['neg', 'negotiating'],
    ['agreedNew', 'agreed'],
  ]);
  assert.equal(out.find((r) => r.jobId === 'neg')?.chosenSeller, '0xseller');
  assert.equal(out.find((r) => r.jobId === 'open')?.chosenSeller, null);
});

test('one request is found by id in any case, and an ended one is not found', async () => {
  assert.equal((await publicRequestOf('NEG', deps))?.state, 'negotiating');
  assert.equal(await publicRequestOf('declined', deps), null);
  assert.equal(await publicRequestOf('missing', deps), null);
});

test('a private request is never on the market, but is still found by id for the people who may see it', async () => {
  const priv = { ...row('secret', 20), visibility: 'agents' as const };
  const withPrivate: PublicRequestDeps = { ...deps, rows: () => [...deps.rows(), priv] };
  assert.equal((await publicRequests(withPrivate)).some((r) => r.jobId === 'secret'), false);
  assert.equal((await publicRequestOf('secret', withPrivate))?.visibility, 'agents');
});
