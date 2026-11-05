import assert from 'node:assert/strict';
import test from 'node:test';
import { localDay, localHour, memoryProgressStore } from './agentProgress.js';
import { progressChecks } from './agentProgressContract.js';

///   npx tsx --test src/db/agentProgress.test.ts

test('claimIsOnce, toldSinceReadsBack and prune30Days on the memory store', async () => {
  await progressChecks(memoryProgressStore());
});

test('dayIsTheLocalDay', () => {
  assert.equal(localDay(Date.UTC(2026, 10, 5, 6, 30), 'Africa/Lagos'), '2026-11-05');
  assert.equal(localDay(Date.UTC(2026, 10, 5, 7, 30), 'Africa/Lagos'), '2026-11-05');
  assert.equal(localDay(Date.UTC(2026, 10, 5, 23, 30), 'Africa/Lagos'), '2026-11-06');
  assert.equal(localHour(Date.UTC(2026, 10, 5, 7), 'Africa/Lagos'), 8);
  assert.equal(localHour(Date.UTC(2026, 10, 5, 23, 30), 'Africa/Lagos'), 0);
});
