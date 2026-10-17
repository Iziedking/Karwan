import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutor } from '../channels/executor.js';
import { locationFit } from '../location/rules.js';
import { buildPostOfferConfirm, buildPostRequestConfirm, type PostOfferPayload, type PostRequestPayload } from './actions.js';

/// Offers and requests say whether the work is goods, in person or remote, and
/// where the buyer wants it done.
///
///   npx tsx --test src/assistant/postKinds.test.ts

const ADA = '0x' + 'a'.repeat(40);

test('a goods request stores near', () => {
  const card = buildPostRequestConfirm({ caller: ADA, brief: 'Two owambe outfits', budgetUsdc: 150, deadlineDays: 7, deliveryKind: 'goods', where: { scope: 'near' } });
  assert.ok(!('error' in card));
  const p = card.payload as PostRequestPayload;
  assert.equal(p.deliveryKind, 'goods');
  assert.deepEqual(p.where, { scope: 'near' });
});

test('a remote offer stores remote', () => {
  const card = buildPostOfferConfirm({ caller: ADA, title: 'Logo design', description: 'Logos in three days', askingPriceUsdc: 60, deliveryKind: 'remote' });
  assert.ok(!('error' in card));
  assert.equal((card.payload as PostOfferPayload).deliveryKind, 'remote');
});

test('a request without where ranks as before', () => {
  const card = buildPostRequestConfirm({ caller: ADA, brief: 'A website', budgetUsdc: 300, deadlineDays: 14 });
  assert.ok(!('error' in card));
  const p = card.payload as PostRequestPayload;
  assert.equal(p.where, undefined);
  const far = { country: 'GH', city: 'Accra', area: null, reach: {} };
  const near = { country: 'NG', city: 'Lagos', area: null, reach: {} };
  assert.equal(locationFit(p.where, near, far, p.deliveryKind), locationFit(p.where, near, near, p.deliveryKind));
});

test('the request sent to the jobs route carries kind and where', async () => {
  const calls: Array<{ path: string; body: unknown }> = [];
  const execute = createExecutor({
    call: async (_a, _m, path, body) => {
      calls.push({ path, body });
      return { status: 200, json: { jobId: '0x1' } };
    },
  });
  const card = buildPostRequestConfirm({ caller: ADA, brief: 'Two owambe outfits', budgetUsdc: 150, deadlineDays: 7, deliveryKind: 'goods', where: { scope: 'country', country: 'GH' } });
  assert.ok(!('error' in card));
  await execute({ address: ADA }, card);
  const body = calls.find((c) => c.path === '/api/jobs')?.body as Record<string, unknown>;
  assert.equal(body.deliveryKind, 'goods');
  assert.deepEqual(body.where, { scope: 'country', country: 'GH' });
});
