import assert from 'node:assert/strict';
import test from 'node:test';
import { memoryRequestLeaseStore, type RequestLeaseStore } from '../db/requestLeases.js';
import { LEASE_MS, RENEW_EVERY_MS, RequestLeaseLostError, STOP_EARLY_MS, createRequestLeases } from './requestLease.js';

/// One server works a request at a time (view 87).
///
///   node ../scripts/run-tests.mjs src/agents/requestLease.test.ts

const T = 1_800_000_000_000;

function twoServers() {
  const store = memoryRequestLeaseStore();
  const clock = { now: T };
  const now = () => clock.now;
  return {
    clock,
    store,
    a: createRequestLeases({ store: () => store, owner: 'a', now }),
    b: createRequestLeases({ store: () => store, owner: 'b', now }),
  };
}

test('the first server to pick a request up holds it, and the second does not act', async () => {
  const { a, b } = twoServers();
  assert.equal(await a.claim('0xJOB'), true);
  await a.ensureHeld('0xjob');
  assert.equal(await b.claim('0xJOB'), false);
  await assert.rejects(b.ensureHeld('0xJOB'), RequestLeaseLostError);
  assert.deepEqual(b.held(), []);
});

test('a request nobody holds is taken when the agent is about to act', async () => {
  const { a, store, clock } = twoServers();
  await a.ensureHeld('0xJOB');
  assert.equal(await store.holds('0xJOB', 'a', clock.now), true);
});

test('holding is checked from memory until the time is nearly up', async () => {
  const calls = { claim: 0 };
  const inner = memoryRequestLeaseStore();
  const store: RequestLeaseStore = { ...inner, claim: (...args) => { calls.claim += 1; return inner.claim(...args); } };
  const clock = { now: T };
  const a = createRequestLeases({ store: () => store, owner: 'a', now: () => clock.now });
  await a.ensureHeld('0xJOB');
  clock.now += LEASE_MS - STOP_EARLY_MS - 1;
  await a.ensureHeld('0xJOB');
  assert.equal(calls.claim, 1);
  clock.now += 1;
  await a.ensureHeld('0xJOB');
  assert.equal(calls.claim, 2, 'at the early stop it takes the lease again before acting');
});

test('renewing keeps every held request, well inside the lease', async () => {
  assert.ok(RENEW_EVERY_MS * 2 < LEASE_MS - STOP_EARLY_MS, 'one missed renewal does not lose a request');
  const { a, b, clock } = twoServers();
  await a.claim('0xONE');
  await a.claim('0xTWO');
  for (let i = 0; i < 10; i += 1) {
    clock.now += RENEW_EVERY_MS;
    assert.deepEqual(await a.renew(), []);
  }
  assert.equal(await b.claim('0xONE'), false);
  assert.deepEqual(a.held().sort(), ['0xone', '0xtwo']);
});

test('a server that stops renewing stops acting before another server can start', async () => {
  const { a, b, clock, store } = twoServers();
  await a.claim('0xJOB');
  clock.now += LEASE_MS - STOP_EARLY_MS;
  assert.equal(await store.holds('0xJOB', 'a', clock.now), true, 'the store still shows it held');
  assert.equal(await b.claim('0xJOB'), false, 'so the second server cannot start yet');
  clock.now += STOP_EARLY_MS + 1;
  assert.equal(await b.claim('0xJOB'), true, 'a dead server\'s request is taken once its time is up');
  await assert.rejects(a.ensureHeld('0xJOB'), RequestLeaseLostError);
  assert.deepEqual(await a.renew(), [], 'and it no longer counts the request as its own');
});

test('a lease lost to another server is reported on the next renewal', async () => {
  const { a, b, clock } = twoServers();
  await a.claim('0xJOB');
  clock.now += LEASE_MS + 1;
  await b.claim('0xJOB');
  assert.deepEqual(await a.renew(), ['0xjob']);
  assert.deepEqual(a.held(), []);
});

test('when the store cannot be reached the request is kept until this server\'s own time is up', async () => {
  const inner = memoryRequestLeaseStore();
  let down = false;
  const store: RequestLeaseStore = { ...inner, claim: (...args) => (down ? Promise.reject(new Error('db down')) : inner.claim(...args)) };
  const clock = { now: T };
  const a = createRequestLeases({ store: () => store, owner: 'a', now: () => clock.now });
  await a.claim('0xJOB');
  down = true;
  clock.now += RENEW_EVERY_MS;
  assert.deepEqual(await a.renew(), []);
  await a.ensureHeld('0xJOB');
  clock.now += LEASE_MS;
  await assert.rejects(a.ensureHeld('0xJOB'), /db down/);
});

test('a request that ended is let go, and another server can take it at once', async () => {
  const { a, b } = twoServers();
  await a.claim('0xJOB');
  await a.release('0xJOB');
  assert.deepEqual(a.held(), []);
  assert.equal(await b.claim('0xJOB'), true);
  await a.release('0xJOB');
  await b.ensureHeld('0xJOB');
});
