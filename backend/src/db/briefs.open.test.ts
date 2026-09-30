import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBriefCandidates, type Brief } from './briefs.js';

const DAY = 86_400_000;
const brief = (jobId: string, createdAt: number, expiredAt?: number): Brief =>
  ({ jobId, briefText: 'x', postedBy: '0xb', createdAt, ...(expiredAt ? { expiredAt } : {}) }) as Brief;

test('only unexpired requests inside the window come back, newest first', () => {
  const now = 1_000 * DAY;
  const ids = openBriefCandidates(
    [brief('0xold', now - 200 * DAY), brief('0xexpired', now - DAY, now - 1000), brief('0xa', now - 3 * DAY), brief('0xb', now - DAY)],
    now,
    180 * DAY,
  );
  assert.deepEqual(ids, ['0xb', '0xa']);
});
