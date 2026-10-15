import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/// The public count of agent record reads. It says how many reads happened,
/// by how many readers, about how many people, and since when. Nothing about
/// any single read leaves: no addresses, prices, refs or detail.
///
///   npx tsx --test src/routes/networkReads.test.ts

process.chdir(mkdtempSync(join(tmpdir(), 'karwan-network-reads-')));
delete process.env.DATABASE_URL;

const { networkRoutes } = await import('./network.js');
const { saveRecordRead, recordReadTotals } = await import('../db/recordReads.js');

const READER_A = '0x00000000000000000000000000000000000000a1';
const READER_B = '0x00000000000000000000000000000000000000b2';
const SUBJECT_X = '0x00000000000000000000000000000000000000c3';
const SUBJECT_Y = '0x00000000000000000000000000000000000000d4';

const read = (id: string, reader: string, subject: string, createdAt: number) => ({
  id,
  reader,
  subject,
  purpose: 'shortlist' as const,
  ref: '0xjob-secret',
  priceUsdc: 0.02,
  paymentTx: '0xpaymenttx',
  scoreAtRead: 71,
  levelAtRead: 'work_verified',
  detail: { counts: { completed: 3 } },
  createdAt,
});

async function getReads() {
  const res = await networkRoutes.request(new Request('http://local/reads'));
  return { status: res.status, text: await res.text() };
}

test('nothing recorded yet reads as zeros with no start date', async () => {
  assert.deepEqual(await recordReadTotals(), { reads: 0, readers: 0, subjects: 0, since: null });
  const res = await getReads();
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.text), { reads: 0, readers: 0, subjects: 0, since: null });
});

test('reads are counted with distinct readers and subjects, from the first read', async () => {
  await saveRecordRead(read('r1', READER_A, SUBJECT_X, 5_000));
  await saveRecordRead(read('r2', READER_A.toUpperCase().replace('0X', '0x'), SUBJECT_Y, 3_000));
  await saveRecordRead(read('r3', READER_B, SUBJECT_X, 9_000));
  await saveRecordRead(read('r3', READER_B, SUBJECT_X, 9_000));

  assert.deepEqual(await recordReadTotals(), { reads: 3, readers: 2, subjects: 2, since: 3_000 });
});

test('the route names only the aggregate fields and never a single read', async () => {
  const res = await getReads();
  assert.equal(res.status, 200);
  const body = JSON.parse(res.text) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ['readers', 'reads', 'since', 'subjects']);
  assert.deepEqual(body, { reads: 3, readers: 2, subjects: 2, since: 3_000 });
  for (const leaked of [READER_A, READER_B, SUBJECT_X, SUBJECT_Y, '0xjob-secret', '0xpaymenttx', '0.02', 'completed']) {
    assert.ok(!res.text.toLowerCase().includes(leaked), `the public count must not carry ${leaked}`);
  }
});
