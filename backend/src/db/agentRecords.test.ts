import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentRecord } from '../agents/agentRecord.js';
import { lockedThisWeekMicros, microsOf, reserved } from '../agents/lockLedger.js';
import { getAgentRecord, reserveLock, updateAgentRecord } from './agentRecords.js';

/// Money set aside for a lock is checked and written as one step (view 87).
///
///   npx tsx --test src/db/agentRecords.test.ts

const NOW = Date.UTC(2026, 10, 16, 12);

const underTheWeek = (jobId: string, usdc: number) => (r: AgentRecord) => {
  if (!r.lock) return { ok: false as const };
  const after = lockedThisWeekMicros(r.lock.locks, NOW) + microsOf(usdc);
  return after > microsOf(r.lock.perWeek.usdc) ? { ok: false as const } : { ok: true as const, record: reserved(r, { at: NOW, usdc, jobId }) };
};

test('two requests agreed in the same moment cannot both fit under one week', async () => {
  const owner = '0xTwoAtOnce';
  await updateAgentRecord(owner, (r) => ({ ...r, lock: { perDeal: { usdc: 100 }, perWeek: { usdc: 100 }, perDay: 3, who: 'record', locks: [] } }));
  const [a, b] = await Promise.all([reserveLock(owner, underTheWeek('0xa', 60)), reserveLock(owner, underTheWeek('0xb', 60))]);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
  assert.equal((await getAgentRecord(owner)).lock?.locks.length, 1);
});

test('a refusal writes nothing, and a person with no rules holds nothing', async () => {
  const owner = '0xnorules';
  const res = await reserveLock(owner, underTheWeek('0xa', 1));
  assert.equal(res.ok, false);
  assert.equal((await getAgentRecord(owner)).lock, undefined);
});
