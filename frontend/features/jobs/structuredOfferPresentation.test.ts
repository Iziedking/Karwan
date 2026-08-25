import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChainEvent } from '@/core/api';
import { latestStructuredOffer } from './structuredOfferPresentation';

function event(
  sequence: number,
  structuredOffer?: ChainEvent['structuredOffer'],
  payload: Record<string, unknown> = {},
): ChainEvent {
  return {
    eventId: `event-${sequence}`,
    dealRoomId: 'room-1',
    sequence,
    type: 'deal.room.state.changed',
    actor: 'platform',
    jobId: 'job-1',
    ts: sequence,
    payload,
    ...(structuredOffer ? { structuredOffer } : {}),
  };
}

test('highest structured offer version wins over newer event text', () => {
  const offer8 = { id: 'offer-8', version: 8, amountUsdc: '90', updatedAt: 800 };
  const offer9 = { id: 'offer-9', version: 9, amountUsdc: '95', updatedAt: 900 };
  const events = [
    event(10, undefined, { priceUsdc: '1' }),
    event(9, offer9),
    event(8, offer8),
  ];
  assert.deepEqual(latestStructuredOffer(events), offer9);
});

test('invalid or over-precision offer snapshots are not presented', () => {
  assert.equal(
    latestStructuredOffer([
      event(1, { id: 'offer-1', version: 1, amountUsdc: '1.0000001', updatedAt: 1 }),
    ]),
    null,
  );
});

test('input event order and payloads remain unchanged', () => {
  const events = [
    event(1, { id: 'offer-1', version: 1, amountUsdc: '10', updatedAt: 1 }),
    event(2, { id: 'offer-2', version: 2, amountUsdc: '11', updatedAt: 2 }),
  ];
  const before = structuredClone(events);
  latestStructuredOffer(events);
  assert.deepEqual(events, before);
});
