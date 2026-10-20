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

test('the shortlist is buyer-only: a seller on the job sees a pulse', async () => {
  const { AUCTION_INTERNAL_TYPES } = await import('../auth/partyScope.js');
  assert.equal(AUCTION_INTERNAL_TYPES.has('request.shortlist'), true);
});

const financier = '0xcccc000000000000000000000000000000000003';

function dealEvent(type: string): KarwanEvent {
  return {
    type,
    jobId: 'job-9',
    actor: 'buyer',
    ts: 900,
    payload: { buyer, seller: stranger, dealAmountUsdc: '2000', proof: 'https://private.example/delivery' },
  };
}

test('a financier sees which financed deal moved and what happened, nothing more', () => {
  const projected = projectFor(dealEvent('deal.disputed'), financier, new Set(), new Set(), new Set(), new Set(['job-9']));
  assert.deepEqual(projected, { type: 'deal.disputed', actor: 'buyer', ts: 900, jobId: 'job-9', payload: {} });
});

test('a financier gets no deal id for events that do not touch their repayment', () => {
  const projected = projectFor(dealEvent('chat.message'), financier, new Set(), new Set(), new Set(), new Set(['job-9']));
  assert.equal('jobId' in projected, false);
  assert.deepEqual(projected.payload, {});
});

test('without a financed position the same event is a plain pulse', () => {
  const projected = projectFor(dealEvent('deal.disputed'), financier, new Set(), new Set(), new Set(), new Set(['job-other']));
  assert.equal('jobId' in projected, false);
});

test('a party to the deal still gets full detail, financed or not', () => {
  const projected = projectFor(dealEvent('deal.disputed'), buyer, new Set(), new Set(), new Set(), new Set(['job-9']));
  assert.equal(projected.payload?.dealAmountUsdc, '2000');
});
