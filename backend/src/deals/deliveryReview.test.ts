import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '../db/deals.js';
import { decideDeliveryReview, reviewOpenFor, reviewableDeliveries } from './deliveryReview.js';

/// A person at Karwan checks a delivery link the scanner flagged.
///
///   npx tsx --test src/deals/deliveryReview.test.ts

const NOW = 1_800_000_000_000;
const REASON = 'Opened in a sandbox: a plain Google Drive folder with the logo files.';

function flagged(over: Partial<DirectDeal> = {}): DirectDeal {
  return {
    jobId: '0xabc', buyer: '0xb', seller: '0xs', delivered: true, deliveredAt: NOW - 1000,
    deliveryRevision: 2, deliveryProof: 'https://drive.google.com/x', verificationStatus: 'suspicious',
    verificationReasons: ['new domain'], ...over,
  } as DirectDeal;
}

test('a suspicious link one person checks as safe is cleared at once', () => {
  const out = decideDeliveryReview(flagged(), { role: 'support', decision: 'safe', reason: REASON }, NOW);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.clears, true);
  assert.equal(out.review.decision, 'safe');
  assert.equal(out.review.deliveryRevision, 2);
  assert.equal(out.review.originalVerdict, 'suspicious');
  assert.deepEqual(out.review.reasons, ['new domain']);
  assert.equal(out.review.steps.length, 1);
});

test('a malicious link needs both credentials before it clears', () => {
  const deal = flagged({ verificationStatus: 'malicious' });
  const first = decideDeliveryReview(deal, { role: 'support', decision: 'safe', reason: REASON }, NOW);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.clears, false);
  assert.equal(first.review.decision, 'pending-approval');

  const withFirst = { ...deal, deliveryReview: first.review };
  const same = decideDeliveryReview(withFirst, { role: 'support', decision: 'safe', reason: REASON }, NOW + 1);
  assert.equal(same.ok, false);
  if (!same.ok) assert.equal(same.code, 'needs-other-reviewer');

  const second = decideDeliveryReview(withFirst, { role: 'admin', decision: 'safe', reason: REASON }, NOW + 2);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.clears, true);
  assert.equal(second.review.decision, 'safe');
  assert.deepEqual(second.review.steps.map((s) => s.role), ['support', 'admin']);
});

test('the approver can still say unsafe, which ends the review blocked', () => {
  const deal = flagged({ verificationStatus: 'malicious' });
  const first = decideDeliveryReview(deal, { role: 'admin', decision: 'safe', reason: REASON }, NOW);
  assert.ok(first.ok);
  const second = decideDeliveryReview({ ...deal, deliveryReview: first.ok ? first.review : undefined }, { role: 'support', decision: 'unsafe', reason: REASON }, NOW + 1);
  assert.ok(second.ok && !second.clears && second.review.decision === 'unsafe');
});

test('unsafe keeps the hold and closes the review for that delivery', () => {
  const out = decideDeliveryReview(flagged(), { role: 'support', decision: 'unsafe', reason: REASON }, NOW);
  assert.ok(out.ok && !out.clears && out.review.decision === 'unsafe');
  const again = decideDeliveryReview({ ...flagged(), deliveryReview: out.ok ? out.review : undefined }, { role: 'admin', decision: 'safe', reason: REASON }, NOW + 1);
  assert.equal(again.ok, false);
  if (!again.ok) assert.equal(again.code, 'already-decided');
});

test('only a held delivery can be reviewed, and every decision says why', () => {
  const cases: Array<[Partial<DirectDeal>, string]> = [
    [{ verificationStatus: 'clean' }, 'not-held'],
    [{ verificationStatus: undefined }, 'not-held'],
    [{ delivered: false }, 'not-held'],
  ];
  for (const [over, code] of cases) {
    const out = decideDeliveryReview(flagged(over), { role: 'admin', decision: 'safe', reason: REASON }, NOW);
    assert.equal(out.ok, false, JSON.stringify(over));
    if (!out.ok) assert.equal(out.code, code);
  }
  const short = decideDeliveryReview(flagged(), { role: 'admin', decision: 'safe', reason: 'ok' }, NOW);
  assert.ok(!short.ok && short.code === 'reason-required');
});

test('a replaced delivery can still be reviewed for the record, and clearing it changes nothing for the money', () => {
  const deal = flagged({
    deliveryRevision: 3, verificationStatus: 'clean', verificationReasons: [],
    deliveryHistory: [
      { revision: 1, submittedAt: NOW - 3000, deliveryProof: 'www.arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 2, submittedAt: NOW - 2000, deliveryProof: 'arcrun.xyz', verificationStatus: 'suspicious' },
      { revision: 3, submittedAt: NOW - 1000, deliveryProof: 'outlier.ai/x', verificationStatus: 'clean' },
    ],
    deliveryReviews: [{ deliveryRevision: 1, originalVerdict: 'suspicious', reasons: ['.xyz'], decision: 'safe', steps: [{ role: 'admin', decision: 'safe', reason: REASON, at: NOW - 2500 }], decidedAt: NOW - 2500 }],
  });
  assert.deepEqual(reviewableDeliveries(deal), [
    { revision: 2, verificationStatus: 'suspicious', current: false, reviewed: null },
    { revision: 1, verificationStatus: 'suspicious', current: false, reviewed: 'safe' },
  ]);
  const out = decideDeliveryReview(deal, { role: 'support', decision: 'safe', reason: REASON }, NOW, 2);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.scope, 'record-only');
  assert.equal(out.clears, true);
  assert.equal(out.review.deliveryRevision, 2);
  assert.equal(out.review.scope, 'record-only');
  const again = decideDeliveryReview(deal, { role: 'admin', decision: 'safe', reason: REASON }, NOW, 1);
  assert.ok(!again.ok && again.code === 'already-decided', 'revision 1 was decided');
  const clean = decideDeliveryReview(deal, { role: 'admin', decision: 'safe', reason: REASON }, NOW, 3);
  assert.ok(!clean.ok && clean.code === 'not-held');
  const missing = decideDeliveryReview(deal, { role: 'admin', decision: 'safe', reason: REASON }, NOW, 9);
  assert.ok(!missing.ok && missing.code === 'no-such-delivery');
});

test('a closed deal is reviewed for the record only, the current delivery included', () => {
  const settled = decideDeliveryReview(flagged({ settledAt: NOW }), { role: 'support', decision: 'safe', reason: REASON }, NOW);
  assert.ok(settled.ok && settled.scope === 'record-only' && settled.clears);
  const cancelled = decideDeliveryReview(flagged({ cancelledAt: NOW }), { role: 'support', decision: 'safe', reason: REASON }, NOW);
  assert.ok(cancelled.ok && cancelled.scope === 'record-only');
  const open = decideDeliveryReview(flagged(), { role: 'support', decision: 'safe', reason: REASON }, NOW);
  assert.ok(open.ok && open.scope === 'current');
});

test('a malicious earlier delivery still needs both credentials for the record', () => {
  const deal = flagged({
    deliveryRevision: 2, verificationStatus: 'clean',
    deliveryHistory: [{ revision: 1, submittedAt: NOW - 2000, deliveryProof: 'x', verificationStatus: 'malicious' }],
  });
  const first = decideDeliveryReview(deal, { role: 'support', decision: 'safe', reason: REASON }, NOW, 1);
  assert.ok(first.ok && !first.clears && first.review.decision === 'pending-approval');
  const withFirst = { ...deal, deliveryReviews: first.ok ? [first.review] : [] };
  assert.equal(reviewOpenFor(withFirst, 1)?.decision, 'pending-approval');
  const second = decideDeliveryReview(withFirst, { role: 'admin', decision: 'safe', reason: REASON }, NOW + 1, 1);
  assert.ok(second.ok && second.clears && second.scope === 'record-only');
});

test('a review of an earlier delivery does not count for a new one', () => {
  const old = decideDeliveryReview(flagged({ deliveryRevision: 1 }), { role: 'support', decision: 'unsafe', reason: REASON }, NOW);
  assert.ok(old.ok);
  const deal = flagged({ deliveryRevision: 2, deliveryReview: old.ok ? old.review : undefined });
  assert.equal(reviewOpenFor(deal), null);
  const fresh = decideDeliveryReview(deal, { role: 'support', decision: 'safe', reason: REASON }, NOW + 1);
  assert.ok(fresh.ok && fresh.clears);
});
