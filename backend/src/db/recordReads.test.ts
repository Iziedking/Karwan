import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV = 'test';
delete process.env.DATABASE_URL;
const { saveRecordRead, readersOf, purgeReadDetails, recentReadBy, deleteReadsFor, readsForRef, keptReadFor } = await import('./recordReads.js');

const base = { purpose: 'shortlist' as const, ref: '0xjob', priceUsdc: 0.01, paymentTx: 'tx', scoreAtRead: 82, levelAtRead: 'work_verified' };
const r = (id: string, reader: string, subject: string, createdAt: number) => ({ ...base, id, reader, subject, detail: { counts: {} }, createdAt });

test('readers are listed newest first, without the price', async () => {
  await saveRecordRead(r('a1', '0xT', '0xADA', 1));
  await saveRecordRead(r('a2', '0xK', '0xADA', 2));
  const list = await readersOf('0xada');
  assert.deepEqual(list.map((x) => x.reader), ['0xk', '0xt']);
  assert.ok(!('priceUsdc' in list[0]!));
});

test('details older than 24h are cleared, scores and receipts stay', async () => {
  await saveRecordRead(r('p1', '0xA', '0xS', 0));
  const n = await purgeReadDetails(86_400_000 + 1);
  assert.ok(n >= 1);
  const kept = await recentReadBy('0xa', '0xs', 0);
  assert.equal(kept?.detail, null);
  assert.equal(kept?.scoreAtRead, 82);
});

test('a fresh read keeps its detail through a purge', async () => {
  await saveRecordRead(r('f1', '0xF', '0xG', 100));
  await purgeReadDetails(200);
  assert.deepEqual((await recentReadBy('0xf', '0xg', 0))?.detail, { counts: {} });
});

test('deleting an account removes its reads both ways', async () => {
  await saveRecordRead(r('d1', '0xGONE', '0xX', 5));
  await saveRecordRead(r('d2', '0xY', '0xGONE', 6));
  assert.equal(await deleteReadsFor('0xgone'), 2);
  assert.equal((await readersOf('0xgone')).length, 0);
});

test('the reads one reader paid for on one request are counted with their total cost', async () => {
  await saveRecordRead({ ...r('c1', '0xR', '0xS1', 10), ref: 'job-1' });
  await saveRecordRead({ ...r('c2', '0xR', '0xS2', 11), ref: 'job-1' });
  await saveRecordRead({ ...r('c3', '0xR', '0xS3', 12), ref: 'job-2' });
  await saveRecordRead({ ...r('c4', '0xOTHER', '0xS4', 13), ref: 'job-1' });
  assert.deepEqual(await readsForRef('job-1', '0xr'), { count: 2, usdc: 0.02 });
  assert.deepEqual(await readsForRef('job-9', '0xr'), { count: 0, usdc: 0 });
});

test('the kept read for one reader, subject and request is the newest with its detail', async () => {
  await saveRecordRead({ ...r('k1', '0xRDR', '0xSUB', 1_000), ref: '0xreq' });
  await saveRecordRead({ ...r('k2', '0xRDR', '0xSUB', 2_000), ref: '0xreq', detail: { counts: { completed: 2 } } });
  await saveRecordRead({ ...r('k3', '0xRDR', '0xSUB', 3_000), ref: '0xother' });
  await saveRecordRead({ ...r('k4', '0xRDR', '0xSUB', 4_000), ref: '0xreq', detail: null });
  const kept = await keptReadFor('0xrdr', '0xsub', '0xreq', 0);
  assert.equal(kept?.id, 'k2');
  assert.equal(await keptReadFor('0xrdr', '0xsub', '0xreq', 2_001), null);
  assert.equal(await keptReadFor('0xrdr', '0xsub', '0xnone', 0), null);
});
