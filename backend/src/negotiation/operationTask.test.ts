import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryAgentRuntimeRepository } from '../db/agentRuntime.js';
import { DurableTaskRunner, InMemoryDurableTaskStore } from '../agents/durableTaskRunner.js';
import { InMemoryNegotiationAttemptStore } from './attempts.js';
import {
  createNegotiationOperationHandlers,
  createNegotiationOperationObserver,
  NEGOTIATION_OPERATION_TASK,
  type NegotiationOperationTaskData,
} from './operationTask.js';
import { InMemoryNegotiationRuntime, type NegotiationPublishCommand } from './runtime.js';
import { InMemoryMandateSnapshotStore } from './mandates.js';

function offer(version: number, id: string) {
  return {
    dealRoomId: 'room-negotiation-operation-1', offerId: id, offerVersion: version,
    senderRole: 'buyer' as const, recipientRole: 'seller' as const,
    kind: version === 1 ? 'OPENING' as const : 'COUNTER' as const, action: 'REVISE_PRICE' as const,
    priceUsdc: '125', deadlineUnix: 2_000, buyerMandateVersion: 3, sellerMandateVersion: 4,
    ...(version === 1 ? {} : { previousOfferId: `offer-${version - 1}`, previousOfferVersion: version - 1 }),
    terms: { scope: 'research', delivery: '48 hours', paymentTerms: 'after acceptance' },
  };
}

function data(overrides: Partial<NegotiationOperationTaskData> = {}): NegotiationOperationTaskData {
  return {
    dealRoomId: 'room-negotiation-operation-1', source: 'manual-review', commandId: 'negotiation-command-1',
    idempotencyKey: 'negotiation-operation:room-1:offer-1', expectedDealRoomVersion: 1,
    rawOffer: offer(1, 'offer-1'),
    mandates: { buyerMaxPriceUsdc: '150', sellerMinPriceUsdc: '100', buyerMandateVersion: 3, sellerMandateVersion: 4 },
    attempt: { id: 'attempt-negotiation-1', attemptNumber: 1, trigger: 'INITIAL_MATCH', triggerReference: 'match-1', strategy: { style: 'balanced' } },
    observedAtUnix: 100,
    ...overrides,
  };
}

test('reviewed negotiation observer persists one attempt, publishes one offer, and checkpoints it', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const rooms = new InMemoryAgentRuntimeRepository();
  const attempts = new InMemoryNegotiationAttemptStore();
  const mandateStore = new InMemoryMandateSnapshotStore();
  const runtime = new InMemoryNegotiationRuntime();
  runtime.seedRoom({ dealRoomId: 'room-negotiation-operation-1', mandates: data().mandates, nowUnix: 90 });
  let calls = 0;
  const executor = {
    async publishOffer(input: NegotiationPublishCommand) {
      calls += 1;
      const result = runtime.publishOffer(input);
      if (result.outcome === 'stale') return { outcome: 'stale' as const, reason: result.reason === 'STALE_DEAL_ROOM' ? 'STALE_DEAL_ROOM' as const : 'STALE_OFFER' as const, dealRoomVersion: result.room.dealRoomVersion, activeOfferVersion: result.room.activeOfferVersion };
      return { outcome: result.outcome, offer: result.offer.offer, dealRoomVersion: result.room.dealRoomVersion, ...(result.supersededOfferId ? { supersededOfferId: result.supersededOfferId } : {}) };
    },
  };
  const observe = createNegotiationOperationObserver(tasks, rooms, mandateStore);
  assert.deepEqual(await observe(data()), { created: true });
  assert.deepEqual(await observe(data()), { created: false });
  assert.equal((await mandateStore.get('room-negotiation-operation-1', 'BUYER', 3))?.constraintsHash.length, 64);
  assert.equal((await mandateStore.get('room-negotiation-operation-1', 'SELLER', 4))?.constraintsHash.length, 64);
  const runner = new DurableTaskRunner(
    tasks,
    createNegotiationOperationHandlers({ executor, attempts, clock: () => 200 }),
    { workerId: 'negotiation-operation-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  assert.equal(calls, 1);
  const attempt = await attempts.get('attempt-negotiation-1');
  assert.equal(attempt?.state, 'waiting');
  assert.equal((await runtime.getRoom('room-negotiation-operation-1')).activeOfferVersion, 1);
  const checkpoints = await tasks.listCheckpoints('task:negotiation:operation:negotiation-operation:room-1:offer-1');
  assert.equal(checkpoints.length, 1);
  assert.equal((checkpoints[0]?.data as { mode?: string }).mode, 'reviewed-negotiation-operation-seam');
  assert.equal((await runner.runOnce(200)).succeeded, 0);
  assert.equal(calls, 1);
});

test('stale reviewed negotiation becomes a temporary impasse without accepting or retrying authority', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const attempts = new InMemoryNegotiationAttemptStore();
  const runtime = new InMemoryNegotiationRuntime();
  const seed = data();
  runtime.seedRoom({ dealRoomId: seed.dealRoomId, mandates: seed.mandates, nowUnix: 90 });
  const initial = runtime.publishOffer({ commandId: 'prior-command', expectedDealRoomVersion: 1, rawOffer: seed.rawOffer, mandates: seed.mandates, nowUnix: 95 });
  assert.equal(initial.outcome, 'published');
  const stale = data({
    commandId: 'stale-command', idempotencyKey: 'negotiation-operation:stale', expectedDealRoomVersion: 1,
    attempt: { id: 'attempt-negotiation-stale', attemptNumber: 2, trigger: 'TERMS_CHANGED', triggerReference: 'event-2', strategy: { style: 'conservative' }, priorOfferVersion: 1 },
  });
  await tasks.enqueue({ id: 'task:negotiation:stale', kind: NEGOTIATION_OPERATION_TASK, idempotencyKey: 'negotiation-operation:stale', availableAt: 100, data: stale, now: 100 });
  const runner = new DurableTaskRunner(
    tasks,
    createNegotiationOperationHandlers({
      attempts,
      clock: () => 200,
      executor: {
        async publishOffer(input) {
          const result = runtime.publishOffer(input);
          if (result.outcome !== 'stale') throw new Error('expected stale offer');
          return { outcome: 'stale', reason: result.reason, dealRoomVersion: result.room.dealRoomVersion, activeOfferVersion: result.room.activeOfferVersion };
        },
      },
    }),
    { workerId: 'negotiation-stale-worker', clock: () => 200 },
  );
  assert.equal((await runner.runOnce(200)).succeeded, 1);
  const attempt = await attempts.get('attempt-negotiation-stale');
  assert.equal(attempt?.state, 'temporary_impasse');
  assert.equal(attempt?.data.reentryCondition, 'material_trigger');
  assert.equal(attempt?.data.resumable, true);
});

test('reviewed negotiation ingress rejects contradictory mandate bounds before enqueue', async () => {
  const tasks = new InMemoryDurableTaskStore();
  const observe = createNegotiationOperationObserver(tasks);
  await assert.rejects(
    observe(data({ mandates: { ...data().mandates, sellerMinPriceUsdc: '151' } })),
    /seller floor exceeds buyer cap/,
  );
  assert.equal((await tasks.listRecent(10)).length, 0);
});
