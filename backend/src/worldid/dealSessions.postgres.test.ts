import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import type { DirectDeal } from '../db/deals.js';
import { createWorldDealSessions, worldAgreementKey, WorldSessionError } from './dealSessions.js';

const url = process.env.KARWAN_WORLD_SESSION_TEST_URL;
test('PostgreSQL World continuity: two deals, replay, binding, races, rollback and recovery', { skip: !url }, async (t) => {
  const target = new URL(url!);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.equal(target.pathname, '/karwan_world_session_test', 'Only the disposable test database is allowed');
  const schema = `world_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^world_test_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 6 });
  try {
    await pool.query('CREATE TABLE direct_deals (job_id TEXT PRIMARY KEY, data JSONB NOT NULL)');
    await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === 'world_id_deal_sessions')!.sql);
    let clock = 1_800_000_000_000;
    let calls = 0;
    let failWrite = false;
    let remoteHook = async () => {};
    let remoteOk = true;
    const transaction = async <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn({ query: async (sql, params) => {
          if (failWrite && sql.startsWith('UPDATE direct_deals')) throw new Error('injected durable write failure');
          return client.query(sql, params ? [...params] : []);
        } });
        await client.query('COMMIT');
        return value;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    };
    const create = () => createWorldDealSessions({
      transaction, rpId: 'rp-test', appId: 'app_test', environment: 'staging', signingKey: '', now: () => clock,
      sign: () => ({ nonce: randomUUID(), sig: 'synthetic-fixture', created_at: clock / 1000, expires_at: clock / 1000 + 300 }),
      verifier: { verify: async () => { calls++; await remoteHook(); return { ok: remoteOk }; } },
    });
    let service = create();
    const buyer = `0x${'a'.repeat(40)}`, seller = `0x${'b'.repeat(40)}`;
    const session = `session_${'a'.repeat(64)}`;
    let sequence = 0;
    const addDeal = async (patch: Partial<DirectDeal> = {}) => {
      const deal = { jobId: randomUUID(), buyer, seller, terms: 'Design a logo', dealAmountUsdc: '20',
        firstReleasePct: 50, agreementVersion: 1, verificationPolicy: 'high_signal', verificationSubject: 'both',
        ...patch } as DirectDeal;
      await pool.query('INSERT INTO direct_deals VALUES ($1,$2)', [deal.jobId, JSON.stringify(deal)]);
      return deal;
    };
    const proof = (nonce: string, sessionId = session) => ({
      protocol_version: '4.0', nonce, environment: 'staging', session_id: sessionId, user_presence_completed: true,
      responses: [{ identifier: 'selfie', issuer_schema_id: 11, expires_at_min: clock / 1000 + 600,
        proof: ['0x01'], session_nullifier: [`0x${(++sequence).toString(16)}`, '0x02'] }],
    });
    const rejects = (operation: Promise<unknown>, code: string) => assert.rejects(operation, (error: unknown) => error instanceof WorldSessionError && error.code === code);

    await t.test('first check binds account; next deal reuses session but needs a fresh proof', async () => {
      const one = await addDeal(); const first = await service.request(one.jobId, buyer, 'buyer');
      assert.equal(first.sessionId, undefined);
      assert.deepEqual(await service.request(one.jobId, buyer, 'buyer'), first, 'reload resumes the request');
      const response = proof(first.nonce);
      const verified = await service.verify(one.jobId, buyer, 'buyer', response);
      assert.equal(verified.highSignalVerification?.buyer?.agreementKey, worldAgreementKey(one));
      assert.equal(verified.highSignalVerification?.seller?.status, 'pending');
      service = create(); // Process restart uses the same durable session and receipt.
      clock += 601000; // The already committed receipt also survives request/proof expiry.
      const before = calls;
      await service.verify(one.jobId, buyer, 'buyer', response);
      assert.equal(calls, before, 'committed retry needs no remote replay');
      await rejects(service.verify(one.jobId, buyer, 'buyer', proof(first.nonce)), 'WORLD_ID_NULLIFIER_REPLAY');
      const two = await addDeal(); const second = await service.request(two.jobId, buyer, 'buyer');
      assert.equal(second.sessionId, session);
      await rejects(service.verify(two.jobId, buyer, 'buyer', response), 'WORLD_ID_REQUEST_REQUIRED');
      await service.verify(two.jobId, buyer, 'buyer', proof(second.nonce));
    });
    await t.test('rejects wrong account, role, environment, session and reused replay pair', async () => {
      const deal = await addDeal(); const req = await service.request(deal.jobId, buyer, 'buyer');
      await rejects(service.request(deal.jobId, seller, 'buyer'), 'forbidden');
      await rejects(service.verify(deal.jobId, seller, 'seller', proof(req.nonce)), 'WORLD_ID_REQUEST_REQUIRED');
      await rejects(service.verify(deal.jobId, buyer, 'buyer', { ...proof(req.nonce), environment: 'production' }), 'WORLD_ID_RESPONSE_INVALID');
      await rejects(service.verify(deal.jobId, buyer, 'buyer', proof(req.nonce, `session_${'c'.repeat(64)}`)), 'WORLD_ID_RESPONSE_INVALID');
      const response = proof(req.nonce); await service.verify(deal.jobId, buyer, 'buyer', response);
      const other = await addDeal(); const next = await service.request(other.jobId, buyer, 'buyer');
      await rejects(service.verify(other.jobId, buyer, 'buyer', { ...response, nonce: next.nonce }), 'WORLD_ID_NULLIFIER_REPLAY');
      const sellerReq = await service.request(other.jobId, seller, 'seller');
      await rejects(service.verify(other.jobId, seller, 'seller', proof(sellerReq.nonce)), 'WORLD_ID_SESSION_MISMATCH');
    });
    await t.test('rechecks exact agreement version after remote verification', async () => {
      const deal = await addDeal(); const req = await service.request(deal.jobId, buyer, 'buyer');
      remoteHook = async () => { await pool.query('UPDATE direct_deals SET data = $2 WHERE job_id = $1', [deal.jobId, JSON.stringify({ ...deal, agreementVersion: 2 })]); };
      await rejects(service.verify(deal.jobId, buyer, 'buyer', proof(req.nonce)), 'WORLD_ID_REQUEST_REQUIRED');
      remoteHook = async () => {};
      assert.equal((await pool.query('SELECT completed_at FROM world_id_deal_checks_v1 WHERE nonce=$1', [req.nonce])).rows[0].completed_at, null);
    });
    await t.test('failed final write rolls back proof consumption, then retry succeeds', async () => {
      const deal = await addDeal(); const req = await service.request(deal.jobId, seller, 'seller');
      const response = proof(req.nonce, `session_${'b'.repeat(64)}`);
      failWrite = true;
      await assert.rejects(service.verify(deal.jobId, seller, 'seller', response), /durable write failure/);
      failWrite = false;
      assert.equal((await pool.query('SELECT * FROM world_id_sessions_v1 WHERE wallet=$1', [seller])).rows.length, 0);
      assert.equal((await pool.query('SELECT completed_at FROM world_id_deal_checks_v1 WHERE nonce=$1', [req.nonce])).rows[0].completed_at, null);
      await service.verify(deal.jobId, seller, 'seller', response);
    });
    await t.test('concurrent duplicate proofs and both parties do not overwrite each other', async () => {
      const deal = await addDeal(); const a = await service.request(deal.jobId, buyer, 'buyer');
      const b = await service.request(deal.jobId, seller, 'seller');
      const response = proof(a.nonce);
      await Promise.all([
        service.verify(deal.jobId, buyer, 'buyer', response), service.verify(deal.jobId, buyer, 'buyer', response),
        service.verify(deal.jobId, seller, 'seller', proof(b.nonce, `session_${'b'.repeat(64)}`)),
      ]);
      const data = (await pool.query('SELECT data FROM direct_deals WHERE job_id=$1', [deal.jobId])).rows[0].data;
      assert.equal(data.highSignalVerification.buyer.status, 'verified');
      assert.equal(data.highSignalVerification.seller.status, 'verified');
      assert.ok(!JSON.stringify(data).includes('session_'), 'private continuity identifier is not in public deal data');
    });
    await t.test('expiry and verifier outage do not mark verified or consume proof', async () => {
      const deal = await addDeal(); let req = await service.request(deal.jobId, buyer, 'buyer');
      const response = proof(req.nonce); clock += 301000;
      await rejects(service.verify(deal.jobId, buyer, 'buyer', response), 'WORLD_ID_REQUEST_EXPIRED');
      req = await service.request(deal.jobId, buyer, 'buyer');
      remoteHook = async () => { throw new Error('offline'); };
      await rejects(service.verify(deal.jobId, buyer, 'buyer', proof(req.nonce)), 'WORLD_ID_UNAVAILABLE');
      assert.equal((await pool.query('SELECT completed_at FROM world_id_deal_checks_v1 WHERE nonce=$1', [req.nonce])).rows[0].completed_at, null);
      remoteHook = async () => {};
      remoteOk = false;
      await rejects(service.verify(deal.jobId, buyer, 'buyer', proof(req.nonce)), 'WORLD_ID_PROOF_REJECTED');
      assert.equal((await pool.query('SELECT completed_at FROM world_id_deal_checks_v1 WHERE nonce=$1', [req.nonce])).rows[0].completed_at, null);
      remoteOk = true;
    });
  } finally {
    await pool.end();
    // Only this generated schema in the explicitly named disposable database.
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
