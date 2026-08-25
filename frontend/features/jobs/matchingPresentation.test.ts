import assert from 'node:assert/strict';
import test from 'node:test';

import {
  agentRuntimePresentationFixtures,
  matchingPresentationFixtures,
} from './matchingPresentation.fixtures';
import {
  formatMatchingTimestamp,
  MATCHING_PRESENTATION_STATES,
  presentMatchingState,
} from './matchingPresentation';

test('fixtures cover every public presentation state', () => {
  const covered = new Set(matchingPresentationFixtures.map((fixture) => fixture.state));
  assert.deepEqual([...covered].sort(), [...MATCHING_PRESENTATION_STATES].sort());
});

for (const fixture of matchingPresentationFixtures) {
  test(`characterizes ${fixture.name}`, () => {
    assert.equal(fixture.state, fixture.expected.state);
    assert.deepEqual(presentMatchingState(fixture.input), fixture.expected);
  });
}

for (const fixture of agentRuntimePresentationFixtures) {
  test(`characterizes ${fixture.name}`, () => {
    assert.equal(fixture.state, fixture.expected.state);
    assert.deepEqual(presentMatchingState(fixture.input), fixture.expected);
  });
}

test('a near-miss raised at queue exhaustion stays reviewable', () => {
  const result = presentMatchingState({
    viewerRole: 'buyer',
    events: [
      {
        type: 'negotiation.exhausted',
        actor: 'buyer',
        ts: 100,
        payload: { nearMissRaised: true, askedPriceUsdc: '125' },
      },
    ],
  });

  assert.equal(result.state, 'awaiting_user_review');
  assert.equal(result.terminal, false);
  assert.equal(result.viewerMustAct, true);
  assert.equal(result.currentOffer?.amountUsdc, '125');
});

test('event order is normalized without mutating the caller input', () => {
  const events = [
    { type: 'negotiation.reopened', actor: 'buyer' as const, ts: 300, payload: {} },
    { type: 'negotiation.exhausted', actor: 'buyer' as const, ts: 200, payload: {} },
  ];
  const before = structuredClone(events);

  const result = presentMatchingState({ events });

  assert.equal(result.state, 'reengagement_scheduled');
  assert.deepEqual(events, before);
});

test('a confirmed settlement wins over a stale pending proposal', () => {
  const pending = matchingPresentationFixtures.find((fixture) => fixture.state === 'match_ready');
  assert.ok(pending?.input.proposal);

  const result = presentMatchingState({
    ...pending.input,
    events: [{ type: 'escrow.settled', actor: 'platform', ts: 900, payload: {} }],
  });

  assert.equal(result.state, 'completed');
  assert.equal(result.terminal, true);
  assert.equal(result.action, 'none');
});

test('a finalized snapshot without a confirmed result never invents completion', () => {
  const result = presentMatchingState({
    job: { finalized: true, escrowFunded: false },
  });

  assert.equal(result.state, 'status_updating');
  assert.equal(result.terminal, false);
  assert.equal(result.reason, 'finalized-without-confirmed-outcome');
});

test('durable stake blockers and funding requests remain actionable without implying execution', () => {
  const blocked = presentMatchingState({
    viewerRole: 'seller',
    events: [{
      type: 'qualification.blocked',
      actor: 'platform',
      ts: 100,
      payload: { reason: 'STAKE_SHORTFALL', approverRole: 'seller' },
    }],
  });
  assert.equal(blocked.state, 'paused_needs_approval');
  assert.equal(blocked.action, 'review_reserve');
  assert.equal(blocked.viewerMustAct, true);
  assert.equal(blocked.recoverable, true);

  const funding = presentMatchingState({
    viewerRole: 'seller',
    events: [{
      type: 'stake.funding.required',
      actor: 'platform',
      ts: 200,
      payload: { shortfallUsdc: '125' },
    }],
  });
  assert.equal(funding.state, 'paused_needs_approval');
  assert.equal(funding.action, 'add_funds');
  assert.equal(funding.reason, 'stake-funding-required');
  assert.equal(funding.currentOffer, null);
});

test('approval expiry and uncertain evidence or financial state stay visible as recoverable status', () => {
  const expired = presentMatchingState({
    viewerRole: 'buyer',
    events: [{
      type: 'approval.expired',
      actor: 'platform',
      ts: 100,
      payload: { approverRole: 'buyer' },
    }],
  });
  assert.equal(expired.state, 'paused_needs_approval');
  assert.equal(expired.action, 'review_reserve');
  assert.equal(expired.viewerMustAct, true);
  assert.equal(expired.reason, 'approval-expired');

  const uncertain = presentMatchingState({
    events: [{
      type: 'financial.reconciling',
      actor: 'platform',
      ts: 200,
      payload: { providerLifecycle: 'RECONCILING' },
    }, {
      type: 'evidence.unknown',
      actor: 'platform',
      ts: 300,
      payload: { reason: 'settlement-unconfirmed' },
    }],
  });
  assert.equal(uncertain.state, 'status_updating');
  assert.equal(uncertain.action, 'retry_status');
  assert.equal(uncertain.reason, 'settlement-unconfirmed');
  assert.equal(uncertain.terminal, false);
  assert.equal(uncertain.recoverable, true);
});

test('durable re-engagement and impasse events preserve recoverability', () => {
  const scheduled = presentMatchingState({
    events: [{
      type: 'deal.room.reengagement_scheduled',
      actor: 'platform',
      ts: 100,
      payload: { trigger: 'FUNDS_CONFIRMED' },
    }],
  });
  assert.equal(scheduled.state, 'reengagement_scheduled');
  assert.equal(scheduled.terminal, false);
  assert.equal(scheduled.recoverable, true);

  const impasse = presentMatchingState({
    events: [{
      type: 'deal.room.temporary_impasse',
      actor: 'platform',
      ts: 200,
      payload: { reason: 'ATTEMPT_CAP' },
    }],
  });
  assert.equal(impasse.state, 'temporarily_unavailable');
  assert.equal(impasse.reason, 'ATTEMPT_CAP');
  assert.equal(impasse.terminal, false);
  assert.equal(impasse.recoverable, true);
});

test('formats offer freshness in the required UTC dual format', () => {
  const timestampMs = Date.UTC(2026, 7, 23, 14, 5);
  assert.equal(formatMatchingTimestamp(timestampMs), '14:05 UTC · 23 AUG');
  assert.equal(formatMatchingTimestamp(timestampMs / 1_000), '14:05 UTC · 23 AUG');
  assert.equal(formatMatchingTimestamp(timestampMs, 'fr'), '14:05 UTC · 23 AOÛT');
  assert.equal(formatMatchingTimestamp(Number.NaN), '');
});
