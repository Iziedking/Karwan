import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import type { DealRecord } from '../deals/dealRecord.js';
import {
  getDealRecord,
  makeShare,
  recordByToken,
  recordedAmong,
  resetDealRecordsForTests,
  revokeShare,
  saveDealRecordOnce,
  shareFor,
  type StoredDealRecord,
} from './dealRecords.js';

/// Deal records and their share links (view 94), on the memory store the tests use.
///
///   npx tsx --test src/db/dealRecords.test.ts

beforeEach(() => resetDealRecordsForTests());

const JOB = '0xD68Fe7d8aaaabbbbccccddddeeeeffff00001111222233334444555566667777';

const stored = (over: Partial<StoredDealRecord> = {}): StoredDealRecord => ({
  jobId: JOB,
  record: { v: 1, jobId: JOB, endedAt: 5 } as DealRecord,
  digest: '0xaa',
  writtenAt: 10,
  proof: { type: 'eip712', primaryType: 'KarwanDealRecord', domain: { name: 'Karwan Attestation', version: '1', chainId: 5042002 }, issuer: '0xissuer', signature: '0xsig' },
  ...over,
});

test('a record is written once: the second save keeps the first', async () => {
  assert.equal(await saveDealRecordOnce(stored()), true);
  assert.equal(await saveDealRecordOnce(stored({ digest: '0xbb', writtenAt: 99 })), false);
  const kept = await getDealRecord(JOB.toLowerCase());
  assert.equal(kept?.digest, '0xaa');
  assert.equal(kept?.writtenAt, 10);
});

test('a record is found whatever case the deal id is written in', async () => {
  await saveDealRecordOnce(stored());
  assert.equal((await getDealRecord(JOB.toUpperCase().replace('0X', '0x')))?.digest, '0xaa');
  assert.equal(await getDealRecord('0xnone'), null);
});

test('which of these deals already have a record', async () => {
  await saveDealRecordOnce(stored());
  assert.deepEqual([...(await recordedAmong([JOB, '0xother']))], [JOB.toLowerCase()]);
  assert.deepEqual([...(await recordedAmong([]))], []);
});

test('each side has one live link: making it again returns the same one', async () => {
  await saveDealRecordOnce(stored());
  const a = await makeShare(JOB, 'buyer');
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await makeShare(JOB, 'buyer'), a);
  const b = await makeShare(JOB, 'seller');
  assert.notEqual(b, a);
  assert.equal(await shareFor(JOB, 'buyer'), a);
  assert.equal(await shareFor(JOB, 'seller'), b);
});

test('a link opens the record and says which side shared it', async () => {
  await saveDealRecordOnce(stored());
  const token = await makeShare(JOB, 'seller');
  const found = await recordByToken(token);
  assert.equal(found?.side, 'seller');
  assert.equal(found?.stored.digest, '0xaa');
  assert.equal(await recordByToken('not-a-token'), null);
});

test('a link taken back no longer opens, and the next one is new', async () => {
  await saveDealRecordOnce(stored());
  const first = await makeShare(JOB, 'buyer');
  assert.equal(await revokeShare(JOB, 'buyer'), true);
  assert.equal(await recordByToken(first), null);
  assert.equal(await shareFor(JOB, 'buyer'), null);
  assert.equal(await revokeShare(JOB, 'buyer'), false);
  const second = await makeShare(JOB, 'buyer');
  assert.notEqual(second, first);
  assert.equal((await recordByToken(second))?.side, 'buyer');
});

test('taking back one side leaves the other side open', async () => {
  await saveDealRecordOnce(stored());
  const buyer = await makeShare(JOB, 'buyer');
  const seller = await makeShare(JOB, 'seller');
  await revokeShare(JOB, 'buyer');
  assert.equal(await recordByToken(buyer), null);
  assert.equal((await recordByToken(seller))?.side, 'seller');
});
