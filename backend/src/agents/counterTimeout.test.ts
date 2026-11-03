import assert from 'node:assert/strict';
import test from 'node:test';
import { DurableTaskRunner, InMemoryDurableTaskStore } from './durableTaskRunner.js';
import {
  COUNTER_TIMEOUT_TASK,
  type CounterWait,
  type CounterWaitPort,
  type LiveCounter,
  armCounterWait,
  counterWaitTask,
  createCounterWaitHandlers,
  planCounterWait,
} from './counterTimeout.js';
import { RELOAD_GRACE_MS, RELOAD_RETRY_MS, configureDurableTimers } from './durableTimers.js';

const JOB = '0xDeF0000000000000000000000000000000000000000000000000000000000002';
const wait: CounterWait = {
  jobId: JOB,
  seller: '0x00000000000000000000000000000000000000aA',
  scheduleVersion: 1_700_000_000_000_002,
  round: 1,
  dueAt: 2_000_000,
};
const waiting: LiveCounter = {
  scheduleVersion: wait.scheduleVersion,
  dueAt: wait.dueAt,
  finalized: false,
  expired: false,
  sellerTried: false,
  otherOffers: 2,
};
const restarted: LiveCounter = { scheduleVersion: 0, finalized: false, expired: false, sellerTried: false, otherOffers: 2 };

test('a seller silent past the wait: the agent moves on', () => {
  assert.equal(planCounterWait(waiting, wait), 'move-on');
});

test('a seller who replied (wait cleared) or was already passed is left alone', () => {
  assert.equal(planCounterWait({ ...waiting, dueAt: undefined }, wait), 'stale');
  assert.equal(planCounterWait({ ...waiting, sellerTried: true }, wait), 'stale');
});

test('a request finalized or expired, or a newer counter, leaves the wait stale', () => {
  assert.equal(planCounterWait({ ...waiting, finalized: true }, wait), 'stale');
  assert.equal(planCounterWait({ ...waiting, expired: true }, wait), 'stale');
  assert.equal(planCounterWait({ ...waiting, scheduleVersion: wait.scheduleVersion + 1 }, wait), 'stale');
});

test('after a restart the agent resumes with the other offers it brought back', () => {
  assert.equal(planCounterWait(restarted, wait), 'resume');
});

test('after a restart with no other offer the request is not closed by mistake', () => {
  assert.equal(planCounterWait({ ...restarted, otherOffers: 0 }, wait), 'stale');
});

test('a request the agent no longer holds is reloaded first', () => {
  assert.equal(planCounterWait(null, wait), 'missing');
});

test('one task per counter, due when the wait ends', () => {
  const input = counterWaitTask(wait, 7);
  assert.equal(input.kind, COUNTER_TIMEOUT_TASK);
  assert.equal(input.idempotencyKey, `buyer:counter-timeout:${JOB.toLowerCase()}:${wait.scheduleVersion}`);
  assert.equal(input.id, `task:${input.idempotencyKey}`);
  assert.equal(input.availableAt, wait.dueAt);
  assert.deepEqual(input.data, wait);
});

function port(initial: LiveCounter | null, reloaded: LiveCounter | null = null) {
  let live = initial;
  const calls: string[] = [];
  const p: CounterWaitPort = {
    live: () => live,
    reseed: async () => {
      calls.push('reseed');
      live = reloaded;
      return reloaded !== null;
    },
    moveOn: async () => {
      calls.push('move-on');
      live = live ? { ...live, sellerTried: true } : live;
    },
    resume: async () => {
      calls.push('resume');
      live = live ? { ...live, sellerTried: true } : live;
    },
  };
  return { p, calls, set: (next: LiveCounter | null) => (live = next) };
}

async function run(p: CounterWaitPort, now: number) {
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(counterWaitTask(wait, 0));
  const runner = new DurableTaskRunner(store, createCounterWaitHandlers(p, { clock: () => now }), { workerId: 'test', clock: () => now });
  return { summary: await runner.runOnce(now), store, runner };
}

test('the runner moves on once, when the wait ends, and not before', async () => {
  const early = port(waiting);
  assert.equal((await run(early.p, wait.dueAt - 1)).summary.succeeded, 0);
  assert.deepEqual(early.calls, []);
  const due = port(waiting);
  assert.equal((await run(due.p, wait.dueAt)).summary.succeeded, 1);
  assert.deepEqual(due.calls, ['move-on']);
});

test('a restart mid-wait: the request is reloaded and the agent resumes once', async () => {
  const fake = port(null, restarted);
  await run(fake.p, wait.dueAt);
  assert.deepEqual(fake.calls, ['reseed', 'resume']);
});

test('a request still being reloaded is retried, then given up after the grace', async () => {
  const fake = port(null, null);
  const store = new InMemoryDurableTaskStore();
  await store.enqueue(counterWaitTask(wait, 0));
  let now = wait.dueAt;
  const runner = new DurableTaskRunner(store, createCounterWaitHandlers(fake.p, { clock: () => now }), { workerId: 'test', clock: () => now });
  assert.equal((await runner.runOnce(now)).waiting, 1);
  now += RELOAD_RETRY_MS;
  fake.set(restarted);
  assert.equal((await runner.runOnce(now)).succeeded, 1);
  assert.deepEqual(fake.calls, ['reseed', 'resume']);

  const gone = port(null, null);
  const { summary } = await run(gone.p, wait.dueAt + RELOAD_GRACE_MS);
  assert.equal(summary.succeeded, 1);
  assert.deepEqual(gone.calls, ['reseed']);
});

test('with the durable runtime on, a counter wait is a task and starts no timer', async () => {
  const queued: unknown[] = [];
  const off = configureDurableTimers(async (input) => {
    queued.push(input);
  });
  try {
    let timers = 0;
    assert.equal(armCounterWait(wait, () => (timers += 1)), true);
    await new Promise((r) => setImmediate(r));
    assert.equal(timers, 0);
    assert.equal(queued.length, 1);
  } finally {
    off();
  }
});
