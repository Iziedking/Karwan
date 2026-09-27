import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres keeps one backup and one live recovery request per wallet',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_recovery_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const store = await import('./recovery.js');
    const { RECOVERY_WAIT_MS } = await import('../recovery/rules.js');
    const W = '0x3333333333333333333333333333333333333333';
    try {
      await client.ensureSchema();
      const backup = {
        walletAddress: W, emailHash: 'h', recoveryAddress: '0x4444444444444444444444444444444444444444',
        kdf: { alg: 'argon2id' as const, m: 65536, t: 3, p: 1, salt: 'c2FsdA' }, iv: 'aXY',
        sealedBlob: new Uint8Array([1, 2]), sealedVerifier: new Uint8Array([3]), createdAt: 1, registeredAt: null,
      };
      assert.equal(await store.saveBackup(backup), 'created');
      assert.equal(await store.saveBackup({ ...backup, iv: 'other' }), 'exists');
      const saved = (await store.getBackup(W))!;
      assert.equal(saved.iv, 'aXY');
      assert.deepEqual(saved.sealedBlob, new Uint8Array([1, 2]));
      assert.deepEqual(saved.kdf, backup.kdf);
      await store.markRegistered(W, 99);
      await store.markRegistered(W, 150);
      assert.equal((await store.getBackup(W))!.registeredAt, 99);

      const [a, b] = await Promise.all([store.openRequest(W, 1000), store.openRequest(W, 1001)]);
      assert.equal(a.request.id, b.request.id, 'concurrent starts share one request');
      assert.equal([a.created, b.created].filter(Boolean).length, 1);
      assert.equal(a.request.releasableAt, 1000 + RECOVERY_WAIT_MS);
      await assert.rejects(
        () => admin.query(`INSERT INTO "${schema}".recovery_requests_v1 (id, wallet_address, state, created_at, releasable_at) VALUES ($1, $2, 'waiting', 1, 2)`, [randomUUID(), W]),
        'the database refuses a second live request',
      );

      await store.saveCancelToken(a.request.id, 'hash-1');
      assert.equal((await store.requestByCancelToken('hash-1'))!.id, a.request.id);
      await store.setRequestState(a.request.id, { state: 'cancelled', cancelledAt: 6000 });
      assert.equal(await store.liveRequest(W), null);

      await store.recordAttempt(W, 10, false);
      await store.recordAttempt(W, 20, true);
      assert.deepEqual(await store.failuresSince(W, 0), [10]);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
