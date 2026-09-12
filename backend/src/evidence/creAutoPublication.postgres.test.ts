import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import type { DirectDeal } from '../db/deals.js';

const testUrl = process.env.TEST_DATABASE_URL;
test('real Postgres fences concurrent deliveries and recovers one pinned CRE request', { skip: !testUrl }, async () => {
  const url = new URL(testUrl!);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'this test requires a disposable local database');
  process.env.DATABASE_URL = testUrl;
  process.env.X402_PAID_SIGNALS_ENABLED = 'false';
  const { ensureSchema, postgresExecutor, closePostgresPool } = await import('../db/client.js');
  const { getDeal, recordDeliveryRevision, updateCrePublication } = await import('../db/deals.js');
  const { automaticallyPublishCreDelivery } = await import('./creAutoPublication.js');
  const { publishCreDeliveryRequest, readCreQueueProgress, claimCreDeliveryRequest, completeCreDeliveryRequest } = await import('./creDeliveryRequestQueue.js');
  const { creDeliveryRequestKey, creDeliveryReportId } = await import('./creDeliveryRequest.js');
  const id = `0x${randomBytes(32).toString('hex')}`;
  const initial = { jobId:id, buyer:`0x${'a'.repeat(40)}`, seller:`0x${'b'.repeat(40)}`, evidenceRequired:true, delivered:false, acceptedAt:Date.now(), agreementVersion:1, createdAt:Date.now() } as DirectDeal;
  try {
    await ensureSchema();
    const sql = postgresExecutor();
    await sql.query('INSERT INTO direct_deals (job_id,buyer,seller,created_at,data) VALUES ($1,$2,$3,$4,$5)', [id,initial.buyer,initial.seller,initial.createdAt,JSON.stringify(initial)]);
    const delivered = await Promise.all([1,2].map(pull=>recordDeliveryRevision(initial,{ delivered:true, deliveryRevision:1, deliveryProof:`https://github.com/Iziedking/Karwan/pull/${pull}` })));
    assert.equal(delivered.filter(Boolean).length,1);
    const current = (await getDeal(id))!;
    let resolutions=0;
    const deps = { enabled:true, now:Date.now, get:getDeal, update:updateCrePublication, publish:publishCreDeliveryRequest, resolveSha:async()=>{resolutions++;return 'c'.repeat(40);} };
    await Promise.all([automaticallyPublishCreDelivery(id,deps),automaticallyPublishCreDelivery(id,deps)]);
    assert.equal(resolutions,1);
    const saved=(await getDeal(id))!;
    assert.equal(saved.deliveryProof,current.deliveryProof);
    assert.equal(saved.creAutoPublication?.published,true);
    const request=saved.creDeliveryRequest!;
    const key=creDeliveryRequestKey(request);
    assert.equal((await readCreQueueProgress(key))?.state,'pending');
    const lease=await claimCreDeliveryRequest([key],Date.now(),600000);
    assert.ok(lease);
    const receipt = { termsVersion:1,evidenceRevision:1,expiresAt:request.expiresAt,decisionCode:1,evidenceCommitment:`0x${'d'.repeat(64)}` as `0x${string}`,verdictCommitment:`0x${'e'.repeat(64)}` as `0x${string}`,reportId:'0x' as `0x${string}`,boundAt:Date.now() };
    receipt.reportId=creDeliveryReportId({dealId:id as `0x${string}`,termsVersion:1,evidenceRevision:1,evidenceCommitment:receipt.evidenceCommitment,verdictCommitment:receipt.verdictCommitment,decisionCode:1,leaseToken:lease.record.leaseToken});
    assert.equal((await completeCreDeliveryRequest(request,receipt)).ok,true);
    assert.equal((await readCreQueueProgress(key))?.state,'completed');
    const correction=await recordDeliveryRevision(saved,{delivered:true,deliveryRevision:2,deliveryProof:'https://github.com/Iziedking/Karwan/pull/3',creDeliveryRequest:undefined,creAutoPublication:undefined});
    assert.ok(correction);
    assert.equal(await updateCrePublication(saved,()=>({creDeliveryRequest:request})),null);
  } finally {
    await closePostgresPool();
  }
});
