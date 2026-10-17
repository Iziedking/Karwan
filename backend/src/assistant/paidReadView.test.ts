import assert from 'node:assert/strict';
import test from 'node:test';
import { paidReadView } from './paidReadView.js';

const read = { level: 'work_verified', tier: 'STRONG', score: 82, counts: { completed: 12, onTimeRate: 92, disputesWon: 0, disputesLost: 0, cancelled: 0 } };

test("once records are sealed, the assistant gets level and tier from a paid read, never the other person's numbers", () => {
  const v = paidReadView(read, 0.01, '0xtx', true);
  assert.deepEqual(v, { level: 'work_verified', tier: 'STRONG', paidUsdc: 0.01, proofTx: '0xtx' });
});

test('before records are sealed, the numbers still come through as today', () => {
  const v = paidReadView(read, 0.01, null, false);
  assert.equal(v.score, 82);
  assert.equal(v.completedDeals, 12);
  assert.equal(v.onTimePercent, 92);
});
