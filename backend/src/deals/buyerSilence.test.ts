import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';
import { AGENT_RAISES_AFTER_MS, reviewOpenUntil, runBuyerSilence, silenceStep, type BuyerSilenceDeps } from './buyerSilence.js';

type Hex = `0x${string}`;
const NOW = 1_800_000_000_000;
const REVIEW_END = BigInt(NOW / 1000 - 60);
const Z20 = `0x${'00'.repeat(20)}` as Hex;

const view = (over: Partial<DealV3View> = {}): DealV3View => ({
  state: DEAL_STATE.Accepted, buyer: Z20, seller: Z20, buyerId: Z20, sellerId: Z20, count: 2, paid: 0, extUsed: 0, revision: 1,
  checkPassed: false, lateMark: false, escalated: false, proposal: false, senior: false, deliveredAt: BigInt(NOW / 1000 - 4 * 86_400), reviewStartAt: 0n,
  reviewEnd: 0n, deadline: 0n, disputedAt: 0n, proposedAt: 0n, proposedBps: 0, sellerNet: 0n, feeTotal: 0n, released: 0n,
  feeReleased: 0n, reserved: 0n, termsHash: `0x${'00'.repeat(32)}`, ...over,
});

const deal = (over: Partial<DirectDeal> = {}): DirectDeal =>
  ({ jobId: 'deal-1', buyer: '0xbuyer', seller: '0xseller', escrowVersion: 'suite', escrowDealId: `0x${'aa'.repeat(32)}`, sellerAgentWalletId: 'seller-w', delivered: true, ...over }) as DirectDeal;

test('nothing happens while the buyer still has review time', () => {
  assert.equal(silenceStep({ deal: deal(), view: view(), reviewEndSecs: BigInt(NOW / 1000 + 60), nowMs: NOW }), 'none');
  assert.equal(silenceStep({ deal: deal(), view: view(), reviewEndSecs: 0n, nowMs: NOW }), 'none');
});

test('review ended with the buyer silent: the seller is asked first', () => {
  assert.equal(silenceStep({ deal: deal(), view: view(), reviewEndSecs: REVIEW_END, nowMs: NOW }), 'prompt');
});

test('the seller did not act within 24 hours: their agent raises it', () => {
  const asked = deal({ buyerSilence: { revision: 1, paid: 0, promptedAt: NOW - AGENT_RAISES_AFTER_MS - 1 } });
  assert.equal(silenceStep({ deal: asked, view: view(), reviewEndSecs: REVIEW_END, nowMs: NOW }), 'agent-raise');
  const recent = deal({ buyerSilence: { revision: 1, paid: 0, promptedAt: NOW - 3_600_000 } });
  assert.equal(silenceStep({ deal: recent, view: view(), reviewEndSecs: REVIEW_END, nowMs: NOW }), 'none');
});

test('a new delivery or the next payment starts over with a fresh prompt', () => {
  const old = deal({ buyerSilence: { revision: 1, paid: 0, promptedAt: NOW - AGENT_RAISES_AFTER_MS - 1, raisedAt: NOW - 1 } });
  assert.equal(silenceStep({ deal: old, view: view({ paid: 1 }), reviewEndSecs: REVIEW_END, nowMs: NOW }), 'prompt');
  assert.equal(silenceStep({ deal: old, view: view({ revision: 2 }), reviewEndSecs: REVIEW_END, nowMs: NOW }), 'prompt');
});

test('no silence step on a failed check, an open dispute, the current escrow, or before delivery', () => {
  const args = { view: view(), reviewEndSecs: REVIEW_END, nowMs: NOW };
  assert.equal(silenceStep({ ...args, deal: deal({ v3CheckFailedRevision: 1 }) }), 'none', 'a failed check is the buyer\'s case');
  assert.equal(silenceStep({ ...args, deal: deal({ disputed: true }) }), 'none');
  assert.equal(silenceStep({ ...args, deal: deal({ escrowVersion: 'v3' }) }), 'none');
  assert.equal(silenceStep({ ...args, deal: deal(), view: view({ deliveredAt: 0n }) }), 'none');
});

function world(d: DirectDeal) {
  const patches: Array<Partial<DirectDeal>> = [];
  const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const raised: string[] = [];
  const deps: BuyerSilenceDeps = {
    readView: async () => view(),
    readReviewEnd: async () => REVIEW_END,
    raise: async (x) => {
      raised.push(x.jobId);
    },
    patchDeal: async (_id, p) => {
      patches.push(p);
    },
    emit: (e) => events.push(e),
  };
  return { deps, patches, events, raised, run: () => runBuyerSilence(deps, d, NOW) };
}

test('the prompt is recorded once and tells the seller when their agent will raise it', async () => {
  const w = world(deal());
  await w.run();
  assert.deepEqual(w.patches[0]!.buyerSilence, { revision: 1, paid: 0, promptedAt: NOW });
  assert.equal(w.events[0]!.type, 'deal.buyer_silent');
  assert.equal(w.events[0]!.payload.stage, 'prompt');
  assert.equal(w.events[0]!.payload.agentRaisesAt, NOW + AGENT_RAISES_AFTER_MS);
  assert.deepEqual(w.raised, []);
});

test('the agent raises it on the seller\'s behalf and the deal reads as a buyer-silence dispute', async () => {
  const w = world(deal({ buyerSilence: { revision: 1, paid: 0, promptedAt: NOW - AGENT_RAISES_AFTER_MS - 1 } }));
  await w.run();
  assert.deepEqual(w.raised, ['deal-1']);
  assert.equal(w.patches[0]!.disputed, true);
  assert.equal(w.patches[0]!.disputedBy, 'seller');
  assert.equal(w.patches[0]!.disputeKind, 'buyer-silent');
  assert.equal(w.patches[0]!.buyerSilence?.raisedBy, 'agent');
  assert.equal(w.events[0]!.payload.stage, 'raised');
  assert.equal(w.events[0]!.payload.by, 'agent');
});

test('a seller may ask for payment only once the review period has ended', () => {
  assert.equal(reviewOpenUntil(BigInt(NOW / 1000 + 60), NOW), NOW + 60_000);
  assert.equal(reviewOpenUntil(REVIEW_END, NOW), null);
  assert.equal(reviewOpenUntil(0n, NOW), Number.POSITIVE_INFINITY, 'review not started: not yet');
});
