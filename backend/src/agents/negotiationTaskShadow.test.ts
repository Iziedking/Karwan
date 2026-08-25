import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryDurableTaskStore, DurableTaskRunner } from './durableTaskRunner.js';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { createNegotiationShadowHandlers, createNegotiationShadowObserver, NEGOTIATION_SHADOW_TASK } from './negotiationTaskShadow.js';
import { InMemoryMandateSnapshotStore, MandateVersionConflictError } from '../negotiation/mandates.js';
import { InMemoryNegotiationRuntime } from '../negotiation/runtime.js';

function data(price = '125') {
  return {
    dealRoomId: 'room-1', commandId: 'command-1', idempotencyKey: 'negotiation:room-1:1', expectedDealRoomVersion: 1,
    rawOffer: {
      dealRoomId: 'room-1', offerId: 'offer-1', offerVersion: 1, senderRole: 'buyer', recipientRole: 'seller', kind: 'OPENING', action: 'REVISE_PRICE',
      priceUsdc: price, deadlineUnix: 2_000, buyerMandateVersion: 3, sellerMandateVersion: 4,
      terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
    },
    mandates: { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4 }, observedAtUnix: 100, source: 'legacy-proposal',
  };
}

test('negotiation shadow task is durable, idempotent, and checkpoint-only', async () => {
  const store = new InMemoryDurableTaskStore();
  await createNegotiationShadowObserver(store)({ data: data() });
  await createNegotiationShadowObserver(store)({ data: data() });
  const runner = new DurableTaskRunner(store, createNegotiationShadowHandlers({ clock: () => 200 }), { workerId: 'worker-1', clock: () => 200 });
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const tasks = await store.claimDue({ workerId: 'inspect', now: 200, leaseMs: 10_000, limit: 10 });
  assert.equal(tasks.length, 0);
  const checkpoints = await store.listCheckpoints('task:negotiation:turn:room-1:offer-1');
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0]?.phase, 'negotiation.turn');
});

test('negotiation observer seeds the V2 foreign-key room without changing authority', async () => {
  const store = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  await createNegotiationShadowObserver(store, rooms)({ data: data() });
  const room = await rooms.getDealRoom('room-1');
  assert.equal(room?.state, 'open');
  assert.deepEqual(room?.data, {
    mode: 'read-only-shadow',
    authoritativeDealRoom: 'legacy',
    buyerMandateVersion: 3,
    sellerMandateVersion: 4,
  });
});

test('valid shadow observations persist immutable mandate snapshots and conflicts fail closed', async () => {
  const store = new InMemoryDurableTaskStore();
  const mandates = new InMemoryMandateSnapshotStore();
  const observe = createNegotiationShadowObserver(store, undefined, mandates);
  await observe({ data: data() });
  assert.equal((await mandates.get('room-1', 'BUYER', 3))?.version, 3);
  assert.equal((await mandates.get('room-1', 'SELLER', 4))?.version, 4);
  await assert.rejects(
    observe({ data: {
      ...data('149'),
      idempotencyKey: 'negotiation:room-1:conflict',
      commandId: 'command-conflict',
      mandates: { ...data().mandates, buyerMaxPriceUsdc: '149' },
    } }),
    MandateVersionConflictError,
  );
  assert.equal((await store.listRecent(10)).length, 1);
});

test('invalid structured offer becomes an auditable rejection instead of a retry loop', async () => {
  const store = new InMemoryDurableTaskStore();
  await createNegotiationShadowObserver(store)({ data: { ...data(), rawOffer: { ...data().rawOffer, unexpected: true }, idempotencyKey: 'negotiation:room-1:2', commandId: 'command-2' } });
  const runner = new DurableTaskRunner(store, { [NEGOTIATION_SHADOW_TASK]: createNegotiationShadowHandlers({ clock: () => 200 })[NEGOTIATION_SHADOW_TASK]! }, { workerId: 'worker-1', clock: () => 200 });
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  const checkpoints = await store.listCheckpoints('task:negotiation:turn:room-1:offer-1');
  assert.equal((checkpoints[0]?.data as { decision?: string }).decision, 'rejected');
});

test('shadow handler persists a clamped structured offer when a durable runtime is supplied', async () => {
  const store = new InMemoryDurableTaskStore();
  const runtime = new InMemoryNegotiationRuntime();
  const input = data();
  runtime.seedRoom({
    dealRoomId: input.dealRoomId,
    mandates: input.mandates,
    nowUnix: 1,
  });
  await createNegotiationShadowObserver(store)({ data: input });

  const handlers = createNegotiationShadowHandlers({
    clock: () => 200,
    offerRuntime: {
      publishOffer: (command) => {
        const result = runtime.publishOffer(command);
        return Promise.resolve({
          outcome: result.outcome,
          dealRoomVersion: 'room' in result ? result.room.dealRoomVersion : result.dealRoomVersion,
          ...(result.outcome === 'published' || result.outcome === 'duplicate'
            ? { offer: { offerId: result.offer.offer.offerId, offerVersion: result.offer.offer.offerVersion } }
            : {}),
          ...(result.outcome === 'stale' ? { reason: result.reason } : {}),
        });
      },
    },
  });
  const runner = new DurableTaskRunner(store, handlers, { workerId: 'worker-1', clock: () => 200 });
  const result = await runner.runOnce(200);
  assert.equal(result.succeeded, 1);
  assert.equal(runtime.getRoom('room-1').activeOfferId, 'offer-1');
  assert.equal(runtime.getRoom('room-1').dealRoomVersion, 2);

  const checkpoints = await store.listCheckpoints('task:negotiation:turn:room-1:offer-1');
  const checkpoint = checkpoints[0]?.data as { offerRuntime?: { outcome?: string; offerVersion?: number } };
  assert.deepEqual(checkpoint.offerRuntime, {
    outcome: 'published',
    dealRoomVersion: 2,
    offerId: 'offer-1',
    offerVersion: 1,
  });

  await createNegotiationShadowObserver(store)({
    data: {
      ...input,
      commandId: 'command-stale',
      idempotencyKey: 'negotiation:room-1:stale',
      rawOffer: {
        ...input.rawOffer,
        offerId: 'offer-2',
        offerVersion: 2,
        previousOfferId: 'offer-1',
        previousOfferVersion: 1,
        priceUsdc: '126',
      },
      // The first projected offer advanced the V2 room to version 2.
      expectedDealRoomVersion: 1,
    },
  });
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const staleCheckpoints = await store.listCheckpoints('task:negotiation:turn:room-1:offer-2');
  const stale = staleCheckpoints[0]?.data as {
    offerRuntime?: { outcome?: string; reason?: string; dealRoomVersion?: number };
  };
  assert.deepEqual(stale.offerRuntime, {
    outcome: 'stale',
    dealRoomVersion: 2,
    reason: 'STALE_DEAL_ROOM',
  });
});
