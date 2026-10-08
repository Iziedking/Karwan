import assert from 'node:assert/strict';
import test from 'node:test';
import { singleFlight } from './singleFlight.js';

test('the same question asked twice at once is asked once', async () => {
  const inflight = new Map<string, Promise<number>>();
  let calls = 0;
  const ask = () => singleFlight(inflight, 'k', async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return 42;
  });
  const [a, b] = await Promise.all([ask(), ask()]);
  assert.equal(a, 42);
  assert.equal(b, 42);
  assert.equal(calls, 1);
  assert.equal(inflight.size, 0);
});

test('a failure is shared once and then forgotten, so the next ask retries', async () => {
  const inflight = new Map<string, Promise<number>>();
  let calls = 0;
  const failing = () => singleFlight(inflight, 'k', async () => {
    calls += 1;
    throw new Error('down');
  });
  await assert.rejects(Promise.all([failing(), failing()]), /down/);
  assert.equal(calls, 1);
  assert.equal(await singleFlight(inflight, 'k', async () => 7), 7);
});

test('different questions are not merged', async () => {
  const inflight = new Map<string, Promise<string>>();
  const [a, b] = await Promise.all([
    singleFlight(inflight, 'a', async () => 'A'),
    singleFlight(inflight, 'b', async () => 'B'),
  ]);
  assert.deepEqual([a, b], ['A', 'B']);
});
