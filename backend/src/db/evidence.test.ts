import assert from 'node:assert/strict';
import test from 'node:test';
import { claimUnique, getRecord, listRecords, putRecord } from './evidence.js';

test('a unique key is claimed by the first owner only', async () => {
  assert.equal(await claimUnique('fp', 'abc', '0xada'), true);
  assert.equal(await claimUnique('fp', 'abc', '0xkemi'), false);
  assert.equal(await claimUnique('fp', 'abc', '0xada'), true, 'the same owner again is fine');
});

test('records round-trip by kind and key', async () => {
  await putRecord('confirm', 'r1', { subject: '0xada', status: 'pending' });
  assert.deepEqual(await getRecord('confirm', 'r1'), { subject: '0xada', status: 'pending' });
  assert.equal(await getRecord('confirm', 'missing'), null);
  await putRecord('confirm', 'r1', { subject: '0xada', status: 'yes' });
  assert.deepEqual(await getRecord('confirm', 'r1'), { subject: '0xada', status: 'yes' });
});

test('records of one kind are listed', async () => {
  await putRecord('cac', 'c1', { status: 'review' });
  await putRecord('cac', 'c2', { status: 'review' });
  const all = await listRecords<{ status: string }>('cac');
  assert.equal(all.filter((r) => r.data.status === 'review').length, 2);
  assert.ok(all.every((r) => typeof r.key === 'string'));
});
