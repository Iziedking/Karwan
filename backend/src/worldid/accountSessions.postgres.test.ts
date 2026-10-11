import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import { createWorldAccountSessions } from './accountSessions.js';
import { WorldSessionError } from './dealSessions.js';

const url = process.env.TEST_DATABASE_URL;

test('World ID session for an account: enrol once, then prove the same person', { skip: !url }, async (t) => {
  const schema = `world_account_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^world_account_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 6 });
  try {
    for (const name of ['world_id_deal_sessions', 'money_out_guard']) {
      await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === name)!.sql);
    }
    let clock = 1_800_000_000_000;
    let calls = 0;
    let remote: () => Promise<boolean> = async () => true;
    const transaction = async <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn({ query: (sql, params) => client.query(sql, params ? [...params] : []) });
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const create = () =>
      createWorldAccountSessions({
        transaction,
        rpId: 'rp-test',
        appId: 'app_test',
        environment: 'staging',
        signingKey: '',
        now: () => clock,
        sign: () => ({ nonce: randomUUID(), sig: 'synthetic-fixture', created_at: clock / 1000, expires_at: clock / 1000 + 300 }),
        verifier: { verify: async () => { calls++; return (await remote()) ? { ok: true } : { ok: false, reason: 'rejected' }; } },
      });
    let service = create();
    const alice = `0x${'a'.repeat(40)}`;
    const bob = `0x${'b'.repeat(40)}`;
    const sessionA = `session_${'a'.repeat(64)}`;
    const sessionB = `session_${'b'.repeat(64)}`;
    let sequence = 0;
    const proof = (nonce: string, sessionId = sessionA) => ({
      protocol_version: '4.0', nonce, environment: 'staging', session_id: sessionId, user_presence_completed: true,
      responses: [{ identifier: 'selfie', issuer_schema_id: 11, expires_at_min: clock / 1000 + 600,
        proof: ['0x01'], session_nullifier: [`0x${(++sequence).toString(16)}`, '0x02'] }],
    });
    const rejects = (op: Promise<unknown>, code: string) =>
      assert.rejects(op, (e: unknown) => e instanceof WorldSessionError && e.code === code);
    const bound = async (wallet: string) =>
      (await pool.query('SELECT session_id FROM world_id_sessions_v1 WHERE wallet = $1', [wallet])).rows[0]?.session_id ?? null;

    await t.test('nothing but enrolment works before a session exists', async () => {
      await rejects(service.request(alice, 'add_address'), 'WORLD_ID_NO_SESSION');
      await rejects(service.request(alice, 'return'), 'WORLD_ID_NO_SESSION');
    });

    await t.test('enrolment saves the session once; a reload resumes the same request', async () => {
      const req = await service.request(alice, 'enrol');
      assert.equal(req.sessionId, undefined);
      assert.deepEqual(await service.request(alice, 'enrol'), req);
      const response = proof(req.nonce);
      assert.deepEqual(await service.verify(alice, 'enrol', response), { purpose: 'enrol' });
      assert.equal(await bound(alice), sessionA);
      service = create();
      const before = calls;
      await service.verify(alice, 'enrol', response);
      assert.equal(calls, before, 'a committed retry needs no second call to World');
      await rejects(service.request(alice, 'enrol'), 'WORLD_ID_SESSION_EXISTS');
    });

    await t.test('a later check carries the saved session and only that session passes', async () => {
      const req = await service.request(alice, 'add_address');
      assert.equal(req.sessionId, sessionA);
      await rejects(service.verify(alice, 'add_address', proof(req.nonce, sessionB)), 'WORLD_ID_RESPONSE_INVALID');
      assert.deepEqual(await service.verify(alice, 'add_address', proof(req.nonce)), { purpose: 'add_address' });
    });

    await t.test('a request answers only its own account and purpose', async () => {
      const req = await service.request(alice, 'return');
      await rejects(service.verify(bob, 'return', proof(req.nonce)), 'WORLD_ID_REQUEST_REQUIRED');
      await rejects(service.verify(alice, 'unpause', proof(req.nonce)), 'WORLD_ID_REQUEST_REQUIRED');
    });

    await t.test('a used proof cannot be replayed on a new request', async () => {
      const first = await service.request(alice, 'unpause');
      const response = proof(first.nonce);
      await service.verify(alice, 'unpause', response);
      const next = await service.request(alice, 'unpause');
      await rejects(service.verify(alice, 'unpause', { ...response, nonce: next.nonce }), 'WORLD_ID_NULLIFIER_REPLAY');
    });

    await t.test("one person's session cannot enrol a second account", async () => {
      const req = await service.request(bob, 'enrol');
      await rejects(service.verify(bob, 'enrol', proof(req.nonce, sessionA)), 'WORLD_ID_SESSION_MISMATCH');
      assert.equal(await bound(bob), null);
    });

    await t.test('two enrolments at once for one account: one session wins', async () => {
      const carol = `0x${'c'.repeat(40)}`;
      const one = await service.request(carol, 'enrol');
      const two = await service.request(carol, 'enrol');
      const results = await Promise.allSettled([
        service.verify(carol, 'enrol', proof(one.nonce, `session_${'1'.repeat(64)}`)),
        service.verify(carol, 'enrol', proof(two.nonce, `session_${'2'.repeat(64)}`)),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.ok(String(await bound(carol)).startsWith('session_'));
    });

    await t.test('expiry, a rejected proof and an outage bind nothing', async () => {
      const dave = `0x${'d'.repeat(40)}`;
      let req = await service.request(dave, 'enrol');
      clock += 301_000;
      await rejects(service.verify(dave, 'enrol', proof(req.nonce, `session_${'d'.repeat(64)}`)), 'WORLD_ID_REQUEST_EXPIRED');
      req = await service.request(dave, 'enrol');
      remote = async () => false;
      await rejects(service.verify(dave, 'enrol', proof(req.nonce, `session_${'d'.repeat(64)}`)), 'WORLD_ID_PROOF_REJECTED');
      remote = async () => { throw new Error('offline'); };
      await rejects(service.verify(dave, 'enrol', proof(req.nonce, `session_${'d'.repeat(64)}`)), 'WORLD_ID_UNAVAILABLE');
      remote = async () => true;
      assert.equal(await bound(dave), null);
    });
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
