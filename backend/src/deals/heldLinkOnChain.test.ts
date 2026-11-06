import assert from 'node:assert/strict';
import test from 'node:test';
import { DEAL_STATE, type DealV3View } from '../chain/dealEscrowV3.js';
import type { DirectDeal } from '../db/deals.js';
import { heldLinkLeadSecs, heldLinkStep } from './heldLinkOnChain.js';

///   npx tsx --test src/deals/heldLinkOnChain.test.ts

const T0 = 1_800_000_000n; // delivered at
const WINDOW = 3_600;
const END = T0 + BigInt(WINDOW); // review end on chain
const LEAD = heldLinkLeadSecs(WINDOW);

const terms = { reviewWindow: WINDOW, silentLongstop: 612_000, maxExtensions: 1 };

function deal(over: Partial<DirectDeal> = {}): DirectDeal {
  return { jobId: '0xjob', escrowVersion: 'suite', delivered: true, deliveryRevision: 1, verificationStatus: 'malicious', ...over } as DirectDeal;
}

function view(over: Partial<DealV3View> = {}): DealV3View {
  return { state: DEAL_STATE.Accepted, deliveredAt: T0, reviewStartAt: T0, reviewEnd: END, extUsed: 0, revision: 1, paid: 0 , ...over } as DealV3View;
}

const at = (secs: bigint) => Number(secs) * 1000;

test('the lead is a quarter of the review window, between 5 minutes and a day', () => {
  assert.equal(heldLinkLeadSecs(3_600), 900);
  assert.equal(heldLinkLeadSecs(600), 300);
  assert.equal(heldLinkLeadSecs(7 * 86_400), 86_400);
});

test('a held link waits while a person may still clear it', () => {
  assert.equal(heldLinkStep({ deal: deal(), view: view(), reviewEndSecs: END, nowMs: at(END - BigInt(LEAD) - 1n), terms }).kind, 'wait');
});

test('close to the claim, the buyer’s extra time comes first, then the dispute', () => {
  const near = at(END - BigInt(LEAD));
  assert.deepEqual(heldLinkStep({ deal: deal(), view: view(), reviewEndSecs: END, nowMs: near, terms }), { kind: 'more-time', revision: 1 });

  const extendedEnd = END + BigInt(WINDOW);
  const afterMoreTime = deal({ heldLinkOnChain: { revision: 1, step: 'more-time', at: near } });
  const extended = view({ extUsed: 1, reviewEnd: extendedEnd });
  assert.equal(heldLinkStep({ deal: afterMoreTime, view: extended, reviewEndSecs: extendedEnd, nowMs: near, terms }).kind, 'wait');
  assert.deepEqual(
    heldLinkStep({ deal: afterMoreTime, view: extended, reviewEndSecs: extendedEnd, nowMs: at(extendedEnd - BigInt(LEAD)), terms }),
    { kind: 'dispute', revision: 1 },
  );
});

test('extra time asked once per delivery: a refused ask goes on to the dispute when due', () => {
  const asked = deal({ heldLinkOnChain: { revision: 1, step: 'more-time', at: 0 } });
  assert.equal(heldLinkStep({ deal: asked, view: view(), reviewEndSecs: END, nowMs: at(END - BigInt(LEAD)), terms }).kind, 'dispute');
});

test('past the claim time with nothing done, the dispute goes at once', () => {
  assert.equal(heldLinkStep({ deal: deal(), view: view(), reviewEndSecs: END, nowMs: at(END + 10n), terms }).kind, 'dispute');
});

test('a review that never started counts from the silence wait, and cannot take extra time', () => {
  const notStarted = view({ reviewStartAt: 0n, reviewEnd: 0n });
  const silence = T0 + BigInt(terms.silentLongstop);
  assert.equal(heldLinkStep({ deal: deal(), view: notStarted, reviewEndSecs: 0n, nowMs: at(silence - BigInt(LEAD) - 1n), terms }).kind, 'wait');
  assert.equal(heldLinkStep({ deal: deal(), view: notStarted, reviewEndSecs: 0n, nowMs: at(silence - BigInt(LEAD)), terms }).kind, 'dispute');
});

test('nothing happens for a clean or cleared link, a disputed or closed deal, or another escrow', () => {
  const near = at(END);
  for (const d of [
    deal({ verificationStatus: 'clean' }),
    deal({ verificationStatus: undefined }),
    deal({ disputed: true }),
    deal({ escrowVersion: 'v3' }),
    deal({ heldLinkOnChain: { revision: 1, step: 'dispute', at: 0 } }),
  ]) {
    assert.equal(heldLinkStep({ deal: d, view: view(), reviewEndSecs: END, nowMs: near, terms }).kind, 'none', JSON.stringify(d));
  }
  assert.equal(heldLinkStep({ deal: deal(), view: view({ state: DEAL_STATE.Disputed }), reviewEndSecs: END, nowMs: near, terms }).kind, 'none');
  assert.equal(heldLinkStep({ deal: deal(), view: view({ state: DEAL_STATE.Settled }), reviewEndSecs: END, nowMs: near, terms }).kind, 'none');
  assert.equal(heldLinkStep({ deal: deal(), view: view({ deliveredAt: 0n }), reviewEndSecs: 0n, nowMs: near, terms }).kind, 'none');
});

test('a new delivery starts afresh: steps on an earlier revision do not count', () => {
  const old = deal({ deliveryRevision: 2, heldLinkOnChain: { revision: 1, step: 'dispute', at: 0 } });
  assert.deepEqual(heldLinkStep({ deal: old, view: view({ revision: 2 }), reviewEndSecs: END, nowMs: at(END - BigInt(LEAD)), terms }), { kind: 'more-time', revision: 2 });
});
