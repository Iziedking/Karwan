import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
const { countPaidRead, paidReadTotals } = await import('./paidReads.js');

const DAY = 86_400_000;

test('no paid read yet counts as zero with no start', async () => {
  assert.deepEqual(await paidReadTotals(), { reads: 0, since: null, byEndpoint: {} });
});

test('every paid read counts once per call, per endpoint, from the first one', async () => {
  await countPaidRead('credit-passport', 5 * DAY + 10);
  await countPaidRead('credit-passport', 5 * DAY + 20);
  await countPaidRead('record', 6 * DAY);
  await countPaidRead('skill-demand', 5 * DAY + 5);

  assert.deepEqual(await paidReadTotals(), {
    reads: 4,
    since: 5 * DAY + 5,
    byEndpoint: { 'credit-passport': 2, record: 1, 'skill-demand': 1 },
  });
});
