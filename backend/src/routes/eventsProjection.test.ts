import assert from 'node:assert/strict';
import test from 'node:test';
import { projectFor } from './events.js';
import type { KarwanEvent } from '../events.js';

const buyer = '0xaaaa000000000000000000000000000000000001';
const stranger = '0xbbbb000000000000000000000000000000000002';

function offerEvent(payload: Record<string, unknown> = {}): KarwanEvent {
  return {
    eventId: 'negotiation:event-1',
    dealRoomId: 'room-1',
    sequence: 4,
    aggregateVersion: 4,
    structuredOffer: {
      id: 'offer-4',
      version: 4,
      amountUsdc: '125',
      updatedAt: 400,
      buyerMandateVersion: 3,
      sellerMandateVersion: 4,
    },
    type: 'negotiation.offer.published',
    jobId: 'job-1',
    actor: 'buyer',
    ts: 400,
    payload,
  };
}

test('a party replay keeps the structured offer and immutable mandate evidence', () => {
  const projected = projectFor(
    offerEvent({ buyer }),
    buyer,
    new Set<string>(),
    new Set<string>(),
  );

  assert.deepEqual(projected.structuredOffer, {
    id: 'offer-4',
    version: 4,
    amountUsdc: '125',
    updatedAt: 400,
    buyerMandateVersion: 3,
    sellerMandateVersion: 4,
  });
  assert.deepEqual(projected.payload, { buyer });
});

test('a stranger replay is a pulse and cannot receive offer or mandate metadata', () => {
  const projected = projectFor(
    offerEvent({ buyer }),
    stranger,
    new Set<string>(),
    new Set<string>(),
  );

  assert.equal('structuredOffer' in projected, false);
  assert.equal('dealRoomId' in projected, false);
  assert.equal('sequence' in projected, false);
  assert.deepEqual(projected.payload, {});
});

test('a tracked party receives a follow-up offer even when the event omits party fields', () => {
  const projected = projectFor(
    offerEvent(),
    buyer,
    new Set(['job-1']),
    new Set(['job-1']),
  );

  assert.equal(projected.structuredOffer?.version, 4);
  assert.deepEqual(projected.payload, {});
});
