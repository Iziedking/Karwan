import assert from 'node:assert/strict';
import test from 'node:test';
import { CLAIM_TTL_MS, leaseTtlMs, memoryLeaseStore, runLeasedTick, withClaim } from './watcherLease.js';

///   npx tsx --test src/ops/watcherLease.test.ts

const T0 = 1_800_000_000_000;

test('a lease lasts two ticks with a two-minute floor', () => {
  assert.equal(leaseTtlMs(60_000), 120_000);
  assert.equal(leaseTtlMs(10_000), 120_000);
  assert.equal(leaseTtlMs(10 * 60_000), 20 * 60_000);
  assert.equal(CLAIM_TTL_MS, 10 * 60_000);
});

/// Two processes share one database: only one runs each tick, and when the
/// holder dies without dropping its lease the other takes over once it expires.
test('two processes on one database: one runs each tick, the other takes over after a kill', async () => {
  const db = memoryLeaseStore();
  const ran: string[] = [];
  const ttl = leaseTtlMs(60_000);
  const tickAs = (holder: string, at: number) =>
    runLeasedTick({ store: db, name: 'dealWatcher', holder, ttlMs: ttl, now: () => at, tick: async () => void ran.push(`${holder}@${at - T0}`) });

  assert.equal(await tickAs('a', T0), true);
  assert.equal(await tickAs('b', T0), false);
  assert.equal(await tickAs('a', T0 + 60_000), true);
  assert.equal(await tickAs('b', T0 + 60_000), false);
  // 'a' is killed after its tick at +60s: no drop, no renewals.
  assert.equal(await tickAs('b', T0 + 60_000 + ttl - 1), false);
  assert.equal(await tickAs('b', T0 + 60_000 + ttl), true);
  assert.equal(await tickAs('a', T0 + 60_000 + ttl + 1), false, 'a restarted process does not steal a live lease');
  assert.deepEqual(ran, ['a@0', 'a@60000', `b@${60_000 + ttl}`]);
});

test('a lease dropped on shutdown is taken at the next tick, and jobs lease separately', async () => {
  const db = memoryLeaseStore();
  assert.equal(await db.take('dealWatcher', 'old', 120_000, T0), true);
  assert.equal(await db.take('poWatcher', 'new', 120_000, T0), true);
  assert.equal(await db.take('dealWatcher', 'new', 120_000, T0 + 1), false);
  await db.drop('dealWatcher', 'new');
  assert.equal(await db.take('dealWatcher', 'new', 120_000, T0 + 1), false, 'only the holder can drop');
  await db.drop('dealWatcher', 'old');
  assert.equal(await db.take('dealWatcher', 'new', 120_000, T0 + 2), true);
  assert.deepEqual((await db.leases()).map((l) => [l.name, l.holder]), [['dealWatcher', 'new'], ['poWatcher', 'new']]);
});

test('a tick that throws still lets the next tick run', async () => {
  const db = memoryLeaseStore();
  const run = (at: number, tick: () => Promise<void>) =>
    runLeasedTick({ store: db, name: 'w', holder: 'a', ttlMs: 120_000, now: () => at, tick });
  await assert.rejects(run(T0, async () => { throw new Error('rpc down'); }), /rpc down/);
  assert.equal(await run(T0 + 60_000, async () => {}), true);
});

/// A process killed mid-action leaves its claim: the deal is held until the
/// claim expires, then acted on once.
test('a claim left by a killed process holds the deal until it expires, then the deal is acted on once', async () => {
  const db = memoryLeaseStore();
  const acted: string[] = [];
  const act = (holder: string, at: number) =>
    withClaim({ store: db, key: 'deal:0xabc', holder, now: () => at }, async () => void acted.push(holder));

  assert.equal(await db.claim('deal:0xabc', 'killed', CLAIM_TTL_MS, T0), true);
  assert.equal(await act('next', T0 + 60_000), false);
  assert.equal(await act('next', T0 + CLAIM_TTL_MS - 1), false);
  assert.equal(await act('next', T0 + CLAIM_TTL_MS), true);
  assert.equal(await act('next', T0 + CLAIM_TTL_MS + 1), true, 'a finished action drops its claim');
  assert.deepEqual(acted, ['next', 'next']);
});

test('the same holder cannot claim one deal twice at once', async () => {
  const db = memoryLeaseStore();
  let inner: boolean | undefined;
  const outer = await withClaim({ store: db, key: 'deal:1', holder: 'a', now: () => T0 }, async () => {
    inner = await withClaim({ store: db, key: 'deal:1', holder: 'a', now: () => T0 }, async () => {});
  });
  assert.equal(outer, true);
  assert.equal(inner, false);
});
