import assert from 'node:assert/strict';
import type { ProgressStore } from './agentProgress.js';

/// The checks every progress store passes, memory and Postgres alike.
export async function progressChecks(s: ProgressStore, owner = '0xA'): Promise<void> {
  const T = Date.UTC(2026, 10, 5, 7);
  const o = owner.toLowerCase();
  assert.equal(await s.claim(owner, '2026-11-05', 'brief', 'day', { lines: ['one'] }, T), true);
  assert.equal(await s.claim(o, '2026-11-05', 'brief', 'day', { lines: ['two'] }, T + 1), false, 'a claim is made once');
  assert.equal(await s.claim(o, '2026-11-06', 'brief', 'day', {}, T + 86_400_000), true);
  await s.markSent(o, '2026-11-05', 'brief', 'day', T + 5);
  assert.equal(await s.claim(o, '2026-11-05', 'insight', 'k1', {}, T + 10), true);
  const rows = (await s.toldSince(owner, T - 1)).filter((r) => r.day === '2026-11-05');
  assert.deepEqual(rows.map((r) => [r.kind, r.state]), [['insight', 'planned'], ['brief', 'sent']], 'what was told reads back, newest first');
  assert.deepEqual(rows[1]!.data, { lines: ['one'] });
  assert.equal(await s.insightsToday(owner, '2026-11-05'), 1);
  assert.equal(await s.claim(o, '2026-10-01', 'brief', 'day', {}, T - 35 * 86_400_000), true);
  assert.equal(await s.prune(T - 30 * 86_400_000), 1, 'rows older than 30 days go');
  assert.equal((await s.toldSince(o, 0)).length, 3);
}
