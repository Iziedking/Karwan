import assert from 'node:assert/strict';
import test from 'node:test';
import { withDealReferences } from './dealReferences.js';

const A = '0xd68fe7d8eaf9cde16836c248d1df7d5811342d77ad987d0b83fb2ccf5e888172';
const TWIN = '0xd68fe7d8' + '0'.repeat(56);

function echoTools() {
  const seen: unknown[] = [];
  const tools = {
    get_deal_status: { description: 'x', execute: async (args: { jobId: string }) => { seen.push(args.jobId); return { ok: args.jobId }; } },
    list_my_deals: { description: 'y', execute: async () => ({ deals: [] }) },
    no_execute: { description: 'z' },
  };
  return { tools, seen };
}

test('a reference becomes the full id before the tool runs', async () => {
  const { tools, seen } = echoTools();
  let reads = 0;
  const wrapped = withDealReferences(tools, async () => { reads++; return [A]; });
  assert.deepEqual(await wrapped.get_deal_status.execute({ jobId: 'D68F-E7D8' }), { ok: A });
  assert.deepEqual(await wrapped.get_deal_status.execute({ jobId: '#d68fe7d8' }), { ok: A });
  assert.deepEqual(seen, [A, A]);
  assert.equal(reads, 1, 'the person’s deals are read once per turn');
});

test('a full id passes through without reading any deals', async () => {
  const { tools } = echoTools();
  const wrapped = withDealReferences(tools, async () => { throw new Error('should not read'); });
  assert.deepEqual(await wrapped.get_deal_status.execute({ jobId: A }), { ok: A });
});

test('a reference that is not theirs, or fits two deals, is answered without running the tool', async () => {
  const { tools, seen } = echoTools();
  const missing = await withDealReferences(tools, async () => []).get_deal_status.execute({ jobId: 'D68F-E7D8' });
  assert.match(String((missing as { error: string }).error), /D68F-E7D8/);
  const twin = await withDealReferences(tools, async () => [A, TWIN]).get_deal_status.execute({ jobId: 'D68F-E7D8' });
  assert.match(String((twin as { error: string }).error), /two deals/i);
  assert.deepEqual(seen, []);
});

test('tools without a deal id, or without execute, are left alone', async () => {
  const { tools } = echoTools();
  const wrapped = withDealReferences(tools, async () => [A]);
  assert.deepEqual(await wrapped.list_my_deals.execute(), { deals: [] });
  assert.equal('execute' in wrapped.no_execute, false);
});
