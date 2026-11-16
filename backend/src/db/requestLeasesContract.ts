import assert from 'node:assert/strict';
import type { RequestLeaseStore } from './requestLeases.js';

/// The checks every request lease store passes, memory and Postgres alike.
export async function leaseChecks(s: RequestLeaseStore, job = '0xJOB'): Promise<void> {
  const T = 1_800_000_000_000;
  const MS = 90_000;
  const lower = job.toLowerCase();

  assert.equal(await s.holds(job, 'a', T), false, 'nobody holds a request never claimed');
  assert.equal(await s.claim(job, 'a', T, MS), true, 'the first claim wins');
  assert.equal(await s.holds(lower, 'a', T + MS), true, 'held to the end of its time, whatever the casing');
  assert.equal(await s.holds(job, 'b', T), false);

  assert.equal(await s.claim(job, 'b', T + 1, MS), false, 'a second server cannot take a live lease');
  assert.equal(await s.holds(job, 'a', T + 1), true, 'and the failed claim changed nothing');

  assert.equal(await s.claim(job, 'a', T + 60_000, MS), true, 'the holder renews');
  assert.equal(await s.holds(job, 'a', T + 60_000 + MS), true);
  assert.equal(await s.claim(job, 'b', T + MS + 1, MS), false, 'renewing moved the end');

  assert.equal(await s.holds(job, 'a', T + 60_000 + MS + 1), false, 'past its time it is not held');
  assert.equal(await s.claim(job, 'b', T + 60_000 + MS + 1, MS), true, 'an expired lease is taken');
  assert.equal(await s.holds(job, 'a', T + 60_000 + MS + 2), false);
  assert.equal(await s.claim(job, 'a', T + 60_000 + MS + 2, MS), false, 'the old holder cannot take it back while it is live');

  await s.release(job, 'a');
  assert.equal(await s.holds(job, 'b', T + 60_000 + MS + 3), true, 'a release by another owner does nothing');
  await s.release(lower, 'b');
  assert.equal(await s.holds(job, 'b', T + 60_000 + MS + 3), false);
  assert.equal(await s.claim(job, 'a', T + 60_000 + MS + 4, MS), true, 'a released request is free at once');

  assert.equal(await s.claim(`${job}-other`, 'b', T, MS), true, 'each request has its own lease');
}
