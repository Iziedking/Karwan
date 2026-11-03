import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import {
  COLLECTION_CLOSE_TASK,
  type CollectionClose,
  type CollectionClosePort,
  type LiveCollection,
  armClose,
  collectionCloseTask,
  createCollectionCloseHandlers,
  planClose,
} from './collectionClose.js';
import { RELOAD_GRACE_MS, RELOAD_RETRY_MS, configureDurableTimers } from './durableTimers.js';

const JOB = '0xAbC0000000000000000000000000000000000000000000000000000000000001';
const close: CollectionClose = { jobId: JOB, scheduleVersion: 1_700_000_000_000_001, closeAt: 1_000_000, startedAt: 955_000 };
const armed: LiveCollection = {
  scheduleVersion: close.scheduleVersion,
  closeAt: close.closeAt,
  fired: false,
  finalized: false,
  expired: false,
  shortlisted: false,
};

test('the close for the window the agent has armed closes it', () => {
  assert.equal(planClose(armed, close), 'close');
});

test('a request the agent no longer holds is reloaded first', () => {
  assert.equal(planClose(null, close), 'missing');
});

test('a window already shortlisted, finalized or expired is left alone', () => {
  assert.equal(planClose({ ...armed, fired: true }, close), 'stale');
  assert.equal(planClose({ ...armed, finalized: true }, close), 'stale');
  assert.equal(planClose({ ...armed, expired: true }, close), 'stale');
});

test('a newer close armed after this one leaves this one stale', () => {
  assert.equal(planClose({ ...armed, scheduleVersion: close.scheduleVersion + 1 }, close), 'stale');
});

test('a close the agent cleared (cancelled or expired request) does nothing', () => {
  assert.equal(planClose({ ...armed, closeAt: undefined }, close), 'stale');
});

test('after a restart the agent holds no window, so the task adopts it', () => {
  const restarted: LiveCollection = { scheduleVersion: 0, fired: false, finalized: false, expired: false, shortlisted: false };
  assert.equal(planClose(restarted, close), 'adopt');
});

test('after a restart a request that already had its shortlist is not shortlisted again', () => {
  const restarted: LiveCollection = { scheduleVersion: 0, fired: false, finalized: false, expired: false, shortlisted: true };
  assert.equal(planClose(restarted, close), 'stale');
});

test('one task per request and window, due at the close time', () => {
  const input = collectionCloseTask(close, 5);
  assert.equal(input.kind, COLLECTION_CLOSE_TASK);
  assert.equal(input.id, `task:buyer:collection-close:${JOB.toLowerCase()}:${close.scheduleVersion}`);
  assert.equal(input.idempotencyKey, `buyer:collection-close:${JOB.toLowerCase()}:${close.scheduleVersion}`);
  assert.equal(input.availableAt, close.closeAt);
  assert.equal(input.now, 5);
  assert.deepEqual(input.data, close);
});

function fakePort(initial: LiveCollection | null, reseeded: LiveCollection | null = null) {
  let live = initial;
  const closes: Array<{ task: CollectionClose; adopt: boolean }> = [];
  let reseeds = 0;
  const port: CollectionClosePort = {
    live: () => live,
    reseed: async () => {
      reseeds += 1;
      live = reseeded;
      return reseeded !== null;
    },
    close: async (task, adopt) => {
      closes.push({ task, adopt });
      live = live ? { ...live, fired: true } : live;
    },
  };
  return { port, closes, reseeds: () => reseeds };
}

async function runDue(port: CollectionClosePort, now = close.closeAt) {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(collectionCloseTask(close, close.closeAt - 30_000));
  const runner = new DurableTaskRunner(store, createCollectionCloseHandlers(port, { clock: () => now }), {
    workerId: 'test',
    clock: () => now,
  });
  const summary = await runner.runOnce(now);
  const task = await store.get(collectionCloseTask(close).id);
  return { summary, task, store, runner };
}

test('the runner closes the armed window once, at the close time', async () => {
  const fake = fakePort(armed);
  const { summary, task } = await runDue(fake.port);
  assert.equal(summary.succeeded, 1);
  assert.deepEqual(fake.closes, [{ task: close, adopt: false }]);
  assert.equal(task?.state, 'succeeded');
});

test('the runner does not close a window before its close time', async () => {
  const fake = fakePort(armed);
  const { summary } = await runDue(fake.port, close.closeAt - 1);
  assert.equal(summary.succeeded, 0);
  assert.equal(fake.closes.length, 0);
});

test('a restart mid-window: the request is reloaded and its shortlist is made once', async () => {
  const restored: LiveCollection = { scheduleVersion: 0, fired: false, finalized: false, expired: false, shortlisted: false };
  const fake = fakePort(null, restored);
  await runDue(fake.port);
  assert.equal(fake.reseeds(), 1);
  assert.deepEqual(fake.closes, [{ task: close, adopt: true }]);
});

test('a request still being reloaded at boot is retried, not dropped', async () => {
  let live: LiveCollection | null = null;
  const closes: boolean[] = [];
  const port: CollectionClosePort = {
    live: () => live,
    reseed: async () => false,
    close: async (_task, adopt) => {
      closes.push(adopt);
    },
  };
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(collectionCloseTask(close, 0));
  let now = close.closeAt;
  const runner = new DurableTaskRunner(store, createCollectionCloseHandlers(port, { clock: () => now }), { workerId: 'test', clock: () => now });
  const first = await runner.runOnce(now);
  assert.equal(first.waiting, 1);
  live = { scheduleVersion: 0, fired: false, finalized: false, expired: false, shortlisted: false };
  now += RELOAD_RETRY_MS;
  const second = await runner.runOnce(now);
  assert.equal(second.succeeded, 1);
  assert.deepEqual(closes, [true]);
});

test('a request that is no longer open is given up after the grace, without a close', async () => {
  const fake = fakePort(null, null);
  const { task } = await runDue(fake.port, close.closeAt + RELOAD_GRACE_MS);
  assert.equal(fake.closes.length, 0);
  assert.equal(task?.state, 'succeeded');
});

test('a retry after a close that threw late sees the window fired and stops', async () => {
  let live: LiveCollection | null = armed;
  let calls = 0;
  const port: CollectionClosePort = {
    live: () => live,
    reseed: async () => false,
    close: async () => {
      calls += 1;
      live = { ...armed, fired: true };
      throw new Error('publish failed after the window fired');
    },
  };
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(collectionCloseTask(close, 0));
  let now = close.closeAt;
  const runner = new DurableTaskRunner(store, createCollectionCloseHandlers(port, { clock: () => now }), { workerId: 'test', clock: () => now });
  const first = await runner.runOnce(now);
  assert.equal(first.retried, 1);
  now += 10 * 60_000;
  const second = await runner.runOnce(now);
  assert.equal(second.succeeded, 1);
  assert.equal(calls, 1);
});

test('with the durable runtime on, arming enqueues the task and starts no timer', async () => {
  const enqueued: unknown[] = [];
  const off = configureDurableTimers(async (input) => {
    enqueued.push(input);
  });
  try {
    let timers = 0;
    const owned = armClose(close, () => {
      timers += 1;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(owned, true);
    assert.equal(timers, 0);
    assert.equal(enqueued.length, 1);
  } finally {
    off();
  }
});

test('a failed enqueue falls back to the timer, so the window still closes', async () => {
  const off = configureDurableTimers(async () => {
    throw new Error('database down');
  });
  try {
    let timers = 0;
    armClose(close, () => {
      timers += 1;
    });
    await new Promise((r) => setImmediate(r));
    assert.equal(timers, 1);
  } finally {
    off();
  }
});

test('with the durable runtime off, arming uses the timer', () => {
  let timers = 0;
  const owned = armClose(close, () => {
    timers += 1;
  });
  assert.equal(owned, false);
  assert.equal(timers, 1);
});
