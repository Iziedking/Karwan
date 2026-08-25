import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryNegotiationRuntime } from './runtime.js';

const mandates = {
  buyerMaxPriceUsdc: '150',
  sellerMinPriceUsdc: '100',
  buyerMandateVersion: 3,
  sellerMandateVersion: 4,
};

function offer(version: number, id: string, price = '125') {
  return {
    dealRoomId: 'room-1', offerId: id, offerVersion: version,
    senderRole: 'buyer' as const, recipientRole: 'seller' as const,
    kind: version === 1 ? 'OPENING' as const : 'COUNTER' as const,
    action: 'REVISE_PRICE' as const, priceUsdc: price, deadlineUnix: 2_000,
    buyerMandateVersion: 3, sellerMandateVersion: 4,
    ...(version === 1 ? {} : { previousOfferId: `offer-${version - 1}`, previousOfferVersion: version - 1 }),
    terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
  };
}

test('publishing a new offer supersedes the active offer and advances the room version', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-1', mandates });
  const first = runtime.publishOffer({ commandId: 'offer-command-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 });
  assert.equal(first.outcome, 'published');
  const second = runtime.publishOffer({ commandId: 'offer-command-2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2', '130'), mandates, nowUnix: 200 });
  assert.equal(second.outcome, 'published');
  if (second.outcome === 'published') assert.equal(second.supersededOfferId, 'offer-1');
  assert.equal(runtime.getRoom('room-1').activeOfferVersion, 2);
});

test('duplicate publish and acceptance commands return the original result', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-1', mandates });
  const command = { commandId: 'offer-command-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 };
  const first = runtime.publishOffer(command);
  assert.deepEqual(first, runtime.publishOffer({ ...command, nowUnix: 999 }));
  const acceptance = { commandId: 'accept-1', dealRoomId: 'room-1', expectedDealRoomVersion: 2, offerId: 'offer-1', offerVersion: 1, buyerMandateVersion: 3, sellerMandateVersion: 4 };
  const accepted = runtime.accept(acceptance);
  assert.deepEqual(accepted, runtime.accept(acceptance));
  assert.equal(accepted.outcome, 'accepted');
});

test('stale acceptance cannot accept an offer superseded by a newer version', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-1', mandates });
  runtime.publishOffer({ commandId: 'offer-command-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 });
  runtime.publishOffer({ commandId: 'offer-command-2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2'), mandates, nowUnix: 200 });
  const stale = runtime.accept({ commandId: 'accept-1', dealRoomId: 'room-1', expectedDealRoomVersion: 2, offerId: 'offer-1', offerVersion: 1, buyerMandateVersion: 3, sellerMandateVersion: 4 });
  assert.deepEqual(stale, { outcome: 'stale', reason: 'STALE_OFFER', current: {
    dealRoomId: 'room-1', dealRoomVersion: 3, activeOfferId: 'offer-2', activeOfferVersion: 2,
    buyerMandateVersion: 3, sellerMandateVersion: 4,
  } });
});

test('a newer offer version with identical structured terms is suppressed', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-1', mandates });
  runtime.publishOffer({ commandId: 'offer-command-1', expectedDealRoomVersion: 1, rawOffer: offer(1, 'offer-1'), mandates, nowUnix: 100 });
  runtime.publishOffer({ commandId: 'offer-command-2', expectedDealRoomVersion: 2, rawOffer: offer(2, 'offer-2', '130'), mandates, nowUnix: 200 });
  const repeated = runtime.publishOffer({ commandId: 'offer-command-3', expectedDealRoomVersion: 3, rawOffer: offer(3, 'offer-3', '130'), mandates, nowUnix: 300 });
  assert.equal(repeated.outcome, 'stale');
  if (repeated.outcome === 'stale') assert.equal(repeated.reason, 'STALE_OFFER');
  assert.equal(runtime.getRoom('room-1').activeOfferId, 'offer-2');
});

test('re-engagement is bounded and deduplicates one trigger key', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-1', mandates });
  const input = { dealRoomId: 'room-1', trigger: 'TERMS_CHANGED' as const, triggerReference: 'event-1', nowUnix: 100, maxAttempts: 3, currentFingerprint: 'changed' };
  assert.deepEqual(runtime.scheduleReengagement(input), { outcome: 'schedule', key: 'TERMS_CHANGED:event-1' });
  assert.deepEqual(runtime.scheduleReengagement(input), { outcome: 'suppress', reason: 'NO_MATERIAL_CHANGE' });
});

test('re-engagement runtime persists spend and suppresses the next attempt at the exact cap', () => {
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({
    dealRoomId: 'room-spend',
    mandates,
    negotiationSpendCapUsdc: '0.050000',
  });
  const first = runtime.scheduleReengagement({
    dealRoomId: 'room-spend',
    trigger: 'TERMS_CHANGED',
    triggerReference: 'event-1',
    nowUnix: 100,
    maxAttempts: 3,
    currentFingerprint: 'changed-1',
    nextAttemptCostUsdc: '0.030000',
  });
  assert.deepEqual(first, { outcome: 'schedule', key: 'TERMS_CHANGED:event-1' });
  assert.equal(runtime.getRoom('room-spend').negotiationSpendUsdc, '0.03');

  const second = runtime.scheduleReengagement({
    dealRoomId: 'room-spend',
    trigger: 'TERMS_CHANGED',
    triggerReference: 'event-2',
    nowUnix: 101,
    maxAttempts: 3,
    currentFingerprint: 'changed-2',
    nextAttemptCostUsdc: '0.020000',
  });
  assert.deepEqual(second, { outcome: 'schedule', key: 'TERMS_CHANGED:event-2' });
  assert.equal(runtime.getRoom('room-spend').negotiationSpendUsdc, '0.05');

  const capped = runtime.scheduleReengagement({
    dealRoomId: 'room-spend',
    trigger: 'TERMS_CHANGED',
    triggerReference: 'event-3',
    nowUnix: 102,
    maxAttempts: 3,
    currentFingerprint: 'changed-3',
    nextAttemptCostUsdc: '0.000001',
  });
  assert.deepEqual(capped, { outcome: 'suppress', reason: 'SPEND_CAP' });
  assert.equal(runtime.getRoom('room-spend').attemptCount, 2);
});
