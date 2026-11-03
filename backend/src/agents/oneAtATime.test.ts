import assert from 'node:assert/strict';
import test from 'node:test';
import { oneAtATime, queuedPerKey } from './oneAtATime.js';

/// One seller is judged once at a time on a request, and sweeps of one request
/// queue instead of overlapping (30 Oct 2026: two sweeps 9 seconds apart both
/// judged the same seller, and it offered twice).

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

test('a second run with the same key while the first is going is turned away', async () => {
  const guard = oneAtATime();
  let runs = 0;
  const work = async () => {
    runs += 1;
    await tick(20);
    return 'offered';
  };
  const [a, b] = await Promise.all([guard.run('job:seller', work), guard.run('JOB:Seller', work)]);
  assert.equal(runs, 1);
  assert.deepEqual([a, b].sort(), ['busy', 'offered'].sort());
});

test('other keys run at the same time, and a key frees up when its run ends, even on a throw', async () => {
  const guard = oneAtATime();
  let running = 0;
  let most = 0;
  const work = async () => {
    running += 1;
    most = Math.max(most, running);
    await tick(10);
    running -= 1;
  };
  await Promise.all([guard.run('a', work), guard.run('b', work)]);
  assert.equal(most, 2);
  await assert.rejects(guard.run('c', async () => Promise.reject(new Error('llm down'))));
  assert.equal(await guard.run('c', async () => 'again'), 'again');
});

test('a sweep asked for during a sweep runs once after it, never alongside', async () => {
  let running = 0;
  let most = 0;
  let runs = 0;
  const sweep = queuedPerKey(async (_key: string) => {
    runs += 1;
    running += 1;
    most = Math.max(most, running);
    await tick(20);
    running -= 1;
  });
  const first = sweep('0xjob');
  await tick(2);
  const second = sweep('0xJOB');
  const third = sweep('0xjob');
  await Promise.all([first, second, third]);
  assert.equal(most, 1, 'never two sweeps of one request at once');
  assert.equal(runs, 2, 'the asks during the first sweep fold into one more sweep');
});

test('sweeps of different requests do not wait on each other, and a failed sweep frees its request', async () => {
  let running = 0;
  let most = 0;
  const sweep = queuedPerKey(async (key: string) => {
    running += 1;
    most = Math.max(most, running);
    await tick(10);
    running -= 1;
    if (key === 'bad') throw new Error('rpc');
  });
  await Promise.all([sweep('a'), sweep('b')]);
  assert.equal(most, 2);
  await assert.rejects(sweep('bad'));
  await sweep('bad').catch(() => undefined);
  await sweep('a');
});
