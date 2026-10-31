import assert from 'node:assert/strict';
import test from 'node:test';
import type { ListingSeller } from './sellerSummary.js';
import { attachPosters } from './posters.js';

const CHIDI = '0x00000000000000000000000000000000000000c1';
const chidi: ListingSeller = { name: 'Chidi Eze', tag: 'chidi', verified: true, rating: { kind: 'new', count: 0 }, country: 'NG' };

test('each request says who posted it, read once per person, never as an address', async () => {
  const asked: string[][] = [];
  const rows = await attachPosters(
    [{ jobId: '0x1' }, { jobId: '0x2' }, { jobId: '0x3' }],
    (jobId) => ({ '0x1': CHIDI.toUpperCase().replace('0X', '0x'), '0x2': CHIDI, '0x3': 'not-an-address' } as Record<string, string>)[jobId],
    async (addresses) => {
      asked.push(addresses);
      return new Map([[CHIDI, chidi]]);
    },
  );
  assert.deepEqual(asked, [[CHIDI]]);
  assert.deepEqual(rows.map((r) => r.poster?.name ?? null), ['Chidi Eze', 'Chidi Eze', null]);
  assert.ok(!JSON.stringify(rows).includes(CHIDI));
});

test('when people cannot be read, the requests still list, with no name', async () => {
  const rows = await attachPosters([{ jobId: '0x1' }], () => CHIDI, async () => {
    throw new Error('down');
  });
  assert.deepEqual(rows, [{ jobId: '0x1', poster: null }]);
});
