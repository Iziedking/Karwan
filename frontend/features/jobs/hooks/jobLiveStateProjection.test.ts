import assert from 'node:assert/strict';
import test from 'node:test';
import type { BuyerBid } from '@/core/api';
import { makeBuyerJob, makeJobEvent } from './jobLiveStateProjection.fixtures';
import { deriveJobLiveState } from './jobLiveStateProjection';

const bid: BuyerBid = {
  seller: '0xseller',
  priceUsdc: '90',
  deadlineUnix: 1_900,
  score: 85,
  suggestedCounterPrice: null,
  suggestedCounterDeadlineDays: null,
  sellerTier: 'established',
  sellerUserAddress: '0xowner',
  sellerDisplayName: 'Seller',
  topicalMatch: 90,
};

test('initial snapshot states are deterministic and monotonic', () => {
  assert.equal(deriveJobLiveState(makeBuyerJob(), []).active, 'posted');
  assert.equal(deriveJobLiveState(makeBuyerJob({ bids: [bid] }), []).active, 'bidding');
  assert.equal(
    deriveJobLiveState(
      makeBuyerJob({ bids: [bid], lastCounterPriceBySeller: { '0xseller': '95' } }),
      [],
    ).active,
    'counter',
  );

  const funded = deriveJobLiveState(makeBuyerJob({ escrowFunded: true }), []);
  assert.equal(funded.active, 'escrow');
  assert.equal(funded.ended, null);
});

test('declined negotiation is terminal but remains capped at the counter step', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [makeJobEvent('agent.declined')],
  );

  assert.equal(result.declined, true);
  assert.equal(result.ended, 'declined');
  assert.equal(result.active, 'counter');
  assert.deepEqual(result.completed, ['posted', 'bidding']);
  assert.equal(result.recoverable, null);
});

test('durable terminal marker keeps a restarted exhausted auction terminal', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid], negotiationEndedAt: 1_700 }),
    [],
  );

  assert.equal(result.declined, true);
  assert.equal(result.ended, 'declined');
  assert.equal(result.active, 'counter');
  assert.equal(result.recoverable, null);
});

test('bounded negotiation exhaustion is recoverable and does not become a decline', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [makeJobEvent('negotiation.exhausted', { reason: 'ATTEMPT_CAP' })],
  );

  assert.equal(result.declined, false);
  assert.equal(result.ended, null);
  assert.equal(result.recoverable, 'temporary_impasse');
  assert.equal(result.active, 'bidding');
});

test('re-engagement remains recoverable until a later live negotiation event', () => {
  const scheduled = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [
      makeJobEvent('negotiation.reopened', {}, 200),
      makeJobEvent('negotiation.exhausted', { reason: 'ATTEMPT_CAP' }, 100),
    ],
  );
  assert.equal(scheduled.recoverable, 'reengagement_scheduled');
  assert.equal(scheduled.ended, null);

  const resumed = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [
      makeJobEvent('bid.submitted', {}, 300),
      makeJobEvent('negotiation.reopened', {}, 200),
      makeJobEvent('negotiation.exhausted', { reason: 'ATTEMPT_CAP' }, 100),
    ],
  );
  assert.equal(resumed.recoverable, null);
  assert.equal(resumed.ended, null);
});

test('durable approval and stake blockers remain visible in the top-level job projection', () => {
  const approval = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [makeJobEvent('approval.requested', { approverRole: 'seller', reason: 'STAKE_SHORTFALL' })],
  );
  assert.equal(approval.recoverable, 'needs_approval');
  assert.equal(approval.ended, null);

  const funding = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [makeJobEvent('stake.funding.required', { shortfallUsdc: '125' })],
  );
  assert.equal(funding.recoverable, 'needs_approval');
  assert.equal(funding.ended, null);
});

test('uncertain evidence or financial state is recoverable status, not a terminal decline', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [makeJobEvent('financial.reconciling', { providerLifecycle: 'RECONCILING' })],
  );
  assert.equal(result.recoverable, 'status_updating');
  assert.equal(result.declined, false);
  assert.equal(result.ended, null);
});

test('a later live negotiation event clears durable runtime attention', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [
      makeJobEvent('bid.submitted', {}, 300),
      makeJobEvent('approval.requested', { approverRole: 'seller' }, 200),
    ],
  );
  assert.equal(result.recoverable, null);
});

test('expired snapshot stays terminal without inventing a match', () => {
  const result = deriveJobLiveState(makeBuyerJob({ expiredAt: 1_500 }), []);

  assert.equal(result.ended, 'expired');
  assert.equal(result.active, 'posted');
  assert.deepEqual(result.outOfReach, null);
});

test('confirmed topical gap with no bids projects an out-of-reach advisory', () => {
  const events = [
    makeJobEvent('negotiation.near-miss.skipped', {
      reason: 'gap-too-wide',
      confirmedTopical: true,
      sellerFloorUsdc: '180',
      buyerCeilingUsdc: '100',
    }),
  ];
  const result = deriveJobLiveState(makeBuyerJob(), events);

  assert.equal(result.ended, 'out-of-reach');
  assert.equal(result.active, 'counter');
  assert.deepEqual(result.outOfReach, {
    closestFloorUsdc: 180,
    ceilingUsdc: 100,
    passedPriceUsdc: null,
  });
});

test('authoritative out-of-reach events retain the passed price', () => {
  const result = deriveJobLiveState(
    makeBuyerJob({ bids: [bid] }),
    [
      makeJobEvent('negotiation.near-miss.declined', {}, 100),
      makeJobEvent(
        'negotiation.out-of-reach',
        { closestFloorUsdc: '175', ceilingUsdc: '100', passedPriceUsdc: '140' },
        200,
      ),
    ],
  );

  assert.equal(result.ended, 'out-of-reach');
  assert.deepEqual(result.outOfReach, {
    closestFloorUsdc: 175,
    ceilingUsdc: 100,
    passedPriceUsdc: 140,
  });
});

test('a live near-miss keeps the flow recoverable instead of terminal', () => {
  const result = deriveJobLiveState(
    makeBuyerJob(),
    [
      // useLiveEvents supplies newest-first rows; the projection normalizes
      // that order before applying the state transitions.
      makeJobEvent('negotiation.near-miss'),
      makeJobEvent('negotiation.near-miss.skipped', {
        reason: 'gap-too-wide',
        confirmedTopical: true,
        sellerFloorUsdc: '180',
        buyerCeilingUsdc: '100',
      }),
    ],
  );

  assert.equal(result.ended, null);
  assert.equal(result.outOfReach, null);
});

test('projection does not mutate or expose the input event array', () => {
  const events = [makeJobEvent('bid.submitted')];
  const before = structuredClone(events);
  const result = deriveJobLiveState(makeBuyerJob(), events);

  assert.deepEqual(events, before);
  assert.notStrictEqual(result.events, events);
});
