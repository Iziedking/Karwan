import assert from 'node:assert/strict';
import test from 'node:test';
import type { DomainEventV2 } from './domainEventStore.js';
import {
  InMemoryIdempotentConsumer,
  InMemoryOutboxStore,
  OutboxDispatcher,
  outboxBackoffMs,
  startOutboxDispatcherLoop,
} from './outboxWorker.js';

function event(id = 'event-1'): DomainEventV2 {
  return {
    id,
    aggregateType: 'deal_room',
    aggregateId: 'room-1',
    aggregateVersion: 2,
    sequence: 1,
    category: 'deal_room',
    type: 'deal.room.state.changed',
    actor: 'platform',
    jobId: 'job-1',
    payload: { state: 'qualifying' },
    occurredAt: 1_000,
  };
}

test('backoff is exponential and bounded', () => {
  assert.equal(outboxBackoffMs(1), 1_000);
  assert.equal(outboxBackoffMs(2), 2_000);
  assert.equal(outboxBackoffMs(3), 4_000);
  assert.equal(outboxBackoffMs(100), 300_000);
});

test('consumer commit followed by dispatcher crash is recovered without duplicate delivery', async () => {
  const store = new InMemoryOutboxStore();
  store.enqueue(event());
  const notification = new InMemoryIdempotentConsumer('notification');
  let crashAfterConsumers = true;
  const dispatcher = new OutboxDispatcher(store, [notification], {
    workerId: 'worker-1',
    maxAttempts: 4,
    baseBackoffMs: 10,
    afterConsumers: async () => {
      if (crashAfterConsumers) throw new Error('simulated dispatcher crash');
    },
  });

  assert.deepEqual(await dispatcher.dispatchOnce(1_000), {
    delivered: 0,
    retried: 1,
    deadLettered: 0,
  });
  assert.equal(notification.calls, 1);
  assert.equal(store.inspect('event-1')?.state, 'retry');

  crashAfterConsumers = false;
  assert.deepEqual(await dispatcher.dispatchOnce(1_010), {
    delivered: 1,
    retried: 0,
    deadLettered: 0,
  });
  assert.equal(notification.calls, 1);
  assert.equal(store.inspect('event-1')?.state, 'delivered');
});

test('bounded failures move an outbox row to dead letter', async () => {
  const store = new InMemoryOutboxStore();
  store.enqueue(event('event-dead'));
  const failing = new InMemoryIdempotentConsumer('failing', async () => {
    throw new Error('consumer unavailable');
  });
  const dispatcher = new OutboxDispatcher(store, [failing], {
    workerId: 'worker-1',
    maxAttempts: 3,
    baseBackoffMs: 10,
  });

  assert.equal((await dispatcher.dispatchOnce(1_000)).retried, 1);
  assert.equal((await dispatcher.dispatchOnce(1_010)).retried, 1);
  assert.equal((await dispatcher.dispatchOnce(1_030)).deadLettered, 1);
  assert.equal(store.inspect('event-dead')?.state, 'dead_letter');
  assert.equal(store.inspect('event-dead')?.attempt, 3);
});

test('an unexpired lease has one claimant and an expired lease is reclaimable', async () => {
  const store = new InMemoryOutboxStore();
  store.enqueue(event('event-lease'));
  const first = await store.claimDue({ workerId: 'a', now: 1_000, leaseMs: 100, limit: 1 });
  const blocked = await store.claimDue({ workerId: 'b', now: 1_050, leaseMs: 100, limit: 1 });
  const reclaimed = await store.claimDue({ workerId: 'b', now: 1_100, leaseMs: 100, limit: 1 });
  assert.equal(first.length, 1);
  assert.equal(blocked.length, 0);
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0]?.attempt, 2);
});

test('dispatcher loop starts immediately, reports errors, and stops cleanly', async () => {
  let calls = 0;
  const errors: string[] = [];
  const stop = startOutboxDispatcherLoop(
    {
      dispatchOnce: async () => {
        calls += 1;
        throw new Error('dispatch unavailable');
      },
    },
    {
      intervalMs: 10_000,
      onError: (error) => errors.push((error as Error).message),
    },
  );

  await new Promise<void>((resolve) => setImmediate(resolve));
  stop();
  assert.equal(calls, 1);
  assert.deepEqual(errors, ['dispatch unavailable']);
});
