import assert from 'node:assert/strict';
import test from 'node:test';
import type { DirectDeal } from '@/core/api';
import { checkSummary } from './checkSummary';

/// Checked by Karwan (view 44, rule 5): what was compared and the result, the
/// buyer's own review only on the buyer's side.
///
///   npx tsx --test features/deals/workspace/checkSummary.test.ts

const deal = (over: Partial<DirectDeal> = {}) => ({
  jobId: '0xjob', buyer: '0xb', seller: '0xs', dealAmountUsdc: '120', firstReleasePct: 100, terms: 'Logo', createdAt: 0, updatedAt: 0, onChain: null,
  acceptedAt: 1, delivered: true, view: { stage: 'awaiting-final-release' }, ...over,
}) as unknown as DirectDeal;

test('the buyer sees the match and what the agents saw', () => {
  assert.deepEqual(
    checkSummary(deal({ deliveryCheck: 'passed', deliveryMatch: { verdict: 'aligned', reason: 'Three logo versions, as agreed.' } }), true, 'one'),
    { compared: 'work', result: 'matches', detail: 'Three logo versions, as agreed.' },
  );
  assert.deepEqual(
    checkSummary(deal({ deliveryCheck: 'held', releaseBlockedReason: 'requirement-mismatch', deliveryMatch: { verdict: 'partial', reason: 'Only two versions came.' } }), true, 'one'),
    { compared: 'work', result: 'gap', detail: 'Only two versions came.' },
  );
  assert.equal(checkSummary(deal({ deliveryCheck: 'checking' }), true, 'one')?.result, 'checking');
  assert.equal(checkSummary(deal({ deliveryCheck: 'unverified' }), true, 'one')?.result, 'unverified');
  assert.equal(checkSummary(deal({ verificationStatus: 'suspicious', deliveryCheck: 'held', releaseBlockedReason: 'security-hold' }), true, 'one')?.result, 'held');
});

test("the seller never sees the buyer's review", () => {
  const seen = checkSummary(deal({ deliveryCheck: 'passed', deliveryMatch: { verdict: 'aligned', reason: 'Private note' } }), false, 'one');
  assert.deepEqual(seen, { compared: 'work', result: 'matches' });
  const gap = checkSummary(deal({ deliveryCheck: 'held', releaseBlockedReason: 'requirement-mismatch', deliveryMatch: { verdict: 'mismatch', reason: 'Private note' } }), false, 'one');
  assert.deepEqual(gap, { compared: 'work', result: 'gap' });
});

test('goods compare the photos and tracking, a handover the handover', () => {
  assert.equal(checkSummary(deal({ deliveryCheck: 'passed' }), true, 'shipped')?.compared, 'goods');
  assert.equal(checkSummary(deal({ deliveryCheck: 'passed' }), true, 'in_person')?.compared, 'handover');
});

test('nothing delivered yet, or a finished deal, has no card', () => {
  assert.equal(checkSummary(deal({ delivered: false, view: { stage: 'awaiting-delivery' } as DirectDeal['view'] }), true, 'one'), null);
  assert.equal(checkSummary(deal({ deliveryCheck: 'passed', view: { stage: 'settled' } as DirectDeal['view'] }), true, 'one'), null);
  assert.equal(checkSummary(deal({}), true, 'one'), null);
});
