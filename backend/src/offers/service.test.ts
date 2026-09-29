import assert from 'node:assert/strict';
import test from 'node:test';
import { createOffer, acceptOffer, withdrawOffer, viewOffers, type OfferDeps } from './service.js';
import { __resetDirectOffersForTest, createDirectOffer, listDirectOffers } from '../db/directOffers.js';
import { jobActionsInFlight } from './jobLock.js';
import type { MatchProposal } from '../db/matchProposals.js';

const agentProposal = (over: Partial<MatchProposal> = {}): MatchProposal => ({
  jobId: '0x' + '2'.repeat(64),
  buyerUser: '0xbuyer',
  buyerAgent: '0xjobagent',
  sellerUser: '0xagentseller',
  sellerAgent: '0xagentsagent',
  agreedPriceUsdc: '250',
  deadlineUnix: 1_500_000,
  termsHash: '0xt',
  proposedAt: 1,
  ...over,
});

const JOB = '0x' + '2'.repeat(64);
const NOW = 1_000_000;

function deps(
  over: Partial<OfferDeps> = {},
): OfferDeps & { calls: string[]; proposals: Map<string, MatchProposal> } {
  const calls: string[] = [];
  const proposals = new Map<string, MatchProposal>();
  return {
    now: () => NOW,
    brief: () => ({ postedBy: '0xbuyer' }),
    job: () => ({ budgetUsdc: '300', deadlineUnix: 2_000_000, open: true, termsHash: '0xt', buyerAgent: '0xjobagent' }),
    wallets: async (u: string) =>
      u === '0xseller'
        ? { userAddress: '0xseller', sellerWalletId: 'w1', sellerAddress: '0xsagent' }
        : { userAddress: '0xbuyer', buyerAddress: '0xbagent' },
    bid: async () => {
      calls.push('bid');
      return { ok: true as const, txHash: '0xtx' };
    },
    getProposal: async (jobId) => proposals.get(jobId) ?? null,
    upsertProposal: async (p) => {
      calls.push('proposal');
      proposals.set(p.jobId, p);
      return p;
    },
    deleteProposal: async (jobId) => {
      calls.push('delete');
      proposals.delete(jobId);
    },
    approve: async () => ({ ok: true as const, txHash: '0xfund' }),
    publicRequest: () => ({ briefText: 'Logo for a bakery', budgetUsdc: '300', deadlineUnix: 2_000_000 }),
    hasAgentBid: () => false,
    fundedUsdc: async (price) => (Number(price) * 1.0075).toFixed(6),
    calls,
    proposals,
    ...over,
  };
}

const input = { priceUsdc: '280', deliverByUnix: 1_500_000, note: 'n' };
const row = (over: Record<string, unknown> = {}) => ({
  jobId: JOB,
  sellerUser: '0xseller',
  sellerAgent: '0xsagent',
  priceUsdc: '280',
  deliverByUnix: 1_500_000,
  note: 'n',
  lapsesAt: 1_600_000,
  createdAt: NOW,
  ...over,
});

test('create writes the row, then bids, and a retry returns the same offer without a second bid', async () => {
  __resetDirectOffersForTest();
  const d = deps();
  const a = await createOffer('0xseller', JOB, input, d);
  const b = await createOffer('0xseller', JOB, input, d);
  assert.equal(a.ok && a.created, true);
  assert.equal(b.ok && !b.created, true);
  assert.deepEqual(d.calls, ['bid']);
  assert.equal((await listDirectOffers(JOB))[0]?.txHash, '0xtx');
});

test('a failed bid marks the offer failed and the seller can try again', async () => {
  __resetDirectOffersForTest();
  const d = deps({
    bid: async () => ({ ok: false as const, reason: 'job-not-open', message: 'This request is closed and can no longer take offers.' }),
  });
  const r = await createOffer('0xseller', JOB, input, d);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 409);
  assert.equal((await listDirectOffers(JOB))[0]?.state, 'failed');
  const again = await createOffer('0xseller', JOB, input, deps());
  assert.equal(again.ok, true);
});

test('seller without agent wallets is told to activate', async () => {
  __resetDirectOffersForTest();
  const r = await createOffer('0xseller', JOB, input, deps({ wallets: async () => null }));
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'NEEDS_ACTIVATION' });
});

test('rule violations come back as 400 with the rule code', async () => {
  __resetDirectOffersForTest();
  const r = await createOffer('0xbuyer', JOB, input, deps());
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 400, c: 'OWN_REQUEST' });
});

test('unknown request is 404', async () => {
  __resetDirectOffersForTest();
  const r = await createOffer('0xseller', JOB, input, deps({ brief: () => null }));
  assert.deepEqual(!r.ok && r.status, 404);
});

test('only the buyer can accept; accept writes a buyer-gated proposal then funds', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row({ priceUsdc: '320' }));
  const d = deps();
  assert.equal((await acceptOffer('0xseller', offer.id, d)).ok, false);
  const r = await acceptOffer('0xbuyer', offer.id, d);
  assert.deepEqual(r, { ok: true, txHash: '0xfund' });
  assert.deepEqual(d.calls, ['proposal']);
  assert.equal((await listDirectOffers(JOB))[0]?.state, 'accepted');
});

test('short buyer agent: nothing accepted, 409 with the top-up code', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const r = await acceptOffer(
    '0xbuyer',
    offer.id,
    deps({ approve: async () => ({ ok: false as const, code: 'INSUFFICIENT_AGENT_BALANCE', message: 'short' }) }),
  );
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'INSUFFICIENT_AGENT_BALANCE' });
  assert.equal((await listDirectOffers(JOB))[0]?.state, 'pending');
});

test('a lapsed offer cannot be accepted', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row({ lapsesAt: NOW - 1, createdAt: NOW - 10 }));
  const r = await acceptOffer('0xbuyer', offer.id, deps());
  assert.deepEqual(!r.ok && r.code, 'LAPSED');
});

test("withdraw is the seller's own pending offer only", async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  assert.equal((await withdrawOffer('0xbuyer', offer.id)).ok, false);
  assert.equal((await withdrawOffer('0xseller', offer.id)).ok, true);
  assert.equal((await withdrawOffer('0xseller', offer.id)).ok, false);
});

test('who sees what: buyer all, seller own, others only the count', async () => {
  __resetDirectOffersForTest();
  await createDirectOffer(row());
  await createDirectOffer(row({ sellerUser: '0xother', sellerAgent: '0xoagent', priceUsdc: '250' }));
  const d = deps();
  assert.equal((await viewOffers('0xbuyer', JOB, d)).offers.length, 2);
  assert.equal((await viewOffers('0xseller', JOB, d)).offers.length, 1);
  const pub = await viewOffers(null, JOB, d);
  assert.equal(pub.count, 2);
  assert.deepEqual(pub.offers, []);
});

test('the view carries the public request and the viewer role', async () => {
  __resetDirectOffersForTest();
  const d = deps();
  assert.equal((await viewOffers('0xBUYER', JOB, d)).role, 'buyer');
  assert.equal((await viewOffers('0xseller', JOB, d)).role, 'seller');
  const pub = await viewOffers(null, JOB, d);
  assert.equal(pub.role, 'visitor');
  assert.deepEqual(pub.request, { briefText: 'Logo for a bakery', budgetUsdc: '300', deadlineUnix: 2_000_000 });
  assert.equal((await viewOffers(null, JOB, deps({ publicRequest: () => null }))).request, null);
});

test('review #1: a failed accept leaves no proposal behind when there was none', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const d = deps({ approve: async () => ({ ok: false as const, code: 'INSUFFICIENT_AGENT_BALANCE', message: 'short' }) });
  await acceptOffer('0xbuyer', offer.id, d);
  assert.equal(d.proposals.size, 0);
});

test('review #1: a failed accept puts back the agent proposal it replaced', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const d = deps({ approve: async () => ({ ok: false as const, code: 'CHAIN', message: 'x' }) });
  d.proposals.set(JOB, agentProposal());
  await acceptOffer('0xbuyer', offer.id, d);
  assert.equal(d.proposals.get(JOB)?.sellerAgent, '0xagentsagent');
});

test('review #3: accept is refused while an approved match exists', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const d = deps();
  d.proposals.set(JOB, agentProposal({ approvedAt: 5 }));
  const r = await acceptOffer('0xbuyer', offer.id, d);
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'ALREADY_MATCHED' });
  assert.equal(d.proposals.get(JOB)?.approvedAt, 5);
});

test('review #3: accept is refused while another action on the job is in flight', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  jobActionsInFlight.add(JOB);
  try {
    const r = await acceptOffer('0xbuyer', offer.id, deps());
    assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'BUSY' });
  } finally {
    jobActionsInFlight.delete(JOB);
  }
});

test('review #3: if the funded match is not this offer, the offer is not marked accepted', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const d = deps();
  d.approve = async () => {
    d.proposals.set(JOB, agentProposal({ approvedAt: 9 }));
    return { ok: true as const, txHash: '0xother' };
  };
  const r = await acceptOffer('0xbuyer', offer.id, d);
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'CONFLICT' });
  assert.equal((await listDirectOffers(JOB))[0]?.state, 'pending');
});

test('review #3: a withdrawn offer cannot then be accepted, and an accepted one cannot be withdrawn', async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  assert.equal((await acceptOffer('0xbuyer', offer.id, deps())).ok, true);
  const w = await withdrawOffer('0xseller', offer.id);
  assert.deepEqual(!w.ok && w.code, 'NOT_PENDING');
  assert.equal((await listDirectOffers(JOB))[0]?.state, 'accepted');
});

test('review #4: a seller already bidding through their agent cannot also send a direct offer', async () => {
  __resetDirectOffersForTest();
  const d = deps({ hasAgentBid: (jobId, agent) => jobId === JOB && agent === '0xsagent' });
  const r = await createOffer('0xseller', JOB, input, d);
  assert.deepEqual(!r.ok && { s: r.status, c: r.code }, { s: 409, c: 'ALREADY_BIDDING' });
  assert.deepEqual(d.calls, []);
});

test('review #5: the buyer sees the exact amount that leaves their wallet, fee included', async () => {
  __resetDirectOffersForTest();
  await createDirectOffer(row({ priceUsdc: '200' }));
  const v = await viewOffers('0xbuyer', JOB, deps());
  assert.equal(v.offers[0]?.fundedUsdc, '201.500000');
  const s = await viewOffers('0xseller', JOB, deps());
  assert.equal(s.offers[0]?.fundedUsdc, undefined);
});

test("review #11: the proposal names the job's own buyer agent, not the user's current one", async () => {
  __resetDirectOffersForTest();
  const { offer } = await createDirectOffer(row());
  const d = deps();
  await acceptOffer('0xbuyer', offer.id, d);
  assert.equal(d.proposals.get(JOB)?.buyerAgent, '0xjobagent');
});
