import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations, type SqlExecutor } from '../db/migrations.js';
import type { CreDeliveryRequest, CreEvidenceReceiptBinding } from './creDeliveryRequest.js';
import {
  CreDeliveryRequestQueueSqlRuntime,
  CreQueueResult,
  PostgresCreDeliveryRequestQueue,
} from './creDeliveryRequestQueue.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

function valueOrThrow<T>(result: CreQueueResult<T>): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

test(
  'Postgres delivery queue serializes publication, claims, recovery and receipt completion',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
    const schema = `karwan_cre_queue_${randomUUID().replaceAll('-', '')}`;
    assert.match(schema, /^karwan_cre_queue_[a-f0-9]{32}$/);
    const client = await pool.connect();
    const transaction = async <T>(operation: (executor: SqlExecutor) => Promise<T>): Promise<T> => {
      const tx = await pool.connect();
      await tx.query('BEGIN');
      try {
        await tx.query(`SET LOCAL search_path TO "${schema}"`);
        const result = await operation(tx);
        await tx.query('COMMIT');
        return result;
      } catch (error) {
        await tx.query('ROLLBACK');
        throw error;
      } finally {
        tx.release();
      }
    };

    const sql: CreDeliveryRequestQueueSqlRuntime = { withTransaction: transaction };
    const queue = new PostgresCreDeliveryRequestQueue(sql);
    const dealId = `0x${'a'.repeat(64)}` as `0x${string}`;
    const request: CreDeliveryRequest = {
      dealId,
      termsVersion: 3,
      evidenceRevision: 2,
      expiresAt: 10_000,
      pullNumber: 42,
      submittedSha: 'a'.repeat(40),
      publishedAt: 1_000,
    };
    const receipt: CreEvidenceReceiptBinding = {
      termsVersion: 3,
      evidenceRevision: 2,
      expiresAt: 9_000,
      decisionCode: 1,
      evidenceCommitment: `0x${'c'.repeat(64)}`,
      verdictCommitment: `0x${'d'.repeat(64)}`,
      reportId: `0x${'e'.repeat(64)}`,
    };

    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      assert.deepEqual(
        await runNumberedMigrations(client),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
      );

      const publications = await Promise.all([
        queue.publish(request, 1_000),
        queue.publish(request, 1_001),
      ]);
      assert.equal(publications.every((result) => result.ok), true);
      const publicationRecords = publications.map(valueOrThrow);
      assert.equal(new Set(publicationRecords.map((record) => record.requestKey)).size, 1);
      assert.equal(publications.filter((result) => result.ok && result.idempotent).length, 1);
      const requestKey = publicationRecords[0]!.requestKey;
      const rowCount = await client.query<{ count: string }>(
        'SELECT count(*) FROM cre_delivery_requests_v1 WHERE request_key = $1',
        [requestKey],
      );
      assert.equal(rowCount.rows[0]?.count, '1');

      const conflict = await queue.publish({ ...request, pullNumber: 43 }, 1_002);
      assert.equal(conflict.ok, false);
      if (!conflict.ok) assert.equal(conflict.code, 'REQUEST_CONFLICT');

      const claims = await Promise.all([
        queue.claim([requestKey], 2_000, 100),
        queue.claim([requestKey], 2_000, 100),
      ]);
      assert.equal(claims.filter((claim) => claim !== null).length, 1);
      const firstClaim = claims.find((claim) => claim !== null)!;
      assert.equal(firstClaim.record.state, 'leased');

      const staleCompletion = await queue.complete(request, receipt, 2_101);
      assert.equal(staleCompletion.ok, false);
      if (!staleCompletion.ok) assert.equal(staleCompletion.code, 'REQUEST_EXPIRED');

      const recovered = await queue.claim([requestKey], 2_101, 1_000);
      assert.ok(recovered);
      assert.equal(recovered.record.state, 'leased');
      const completed = valueOrThrow(await queue.complete(request, receipt, 2_200));
      assert.equal(completed.state, 'completed');
      const replay = await queue.complete(request, receipt, 2_201);
      assert.equal(replay.ok, true);
      if (replay.ok) assert.equal(replay.idempotent, true);
      const conflictingReceipt = await queue.complete(request, { ...receipt, decisionCode: 2 }, 2_202);
      assert.equal(conflictingReceipt.ok, false);
      if (!conflictingReceipt.ok) assert.equal(conflictingReceipt.code, 'RECEIPT_CONFLICT');

      const correctedRequest = {
        ...request,
        evidenceRevision: 3,
        submittedSha: 'b'.repeat(40),
        publishedAt: 3_000,
      };
      const corrected = valueOrThrow(await queue.publish(correctedRequest, 3_000));
      assert.equal(await queue.cancel(dealId, 3_001), 1);
      assert.equal(await queue.claim([corrected.requestKey], 3_002, 1_000), null);
      const cancelled = await client.query<{ state: string; lease_token: string | null }>(
        'SELECT state, lease_token FROM cre_delivery_requests_v1 WHERE request_key = $1',
        [corrected.requestKey],
      );
      assert.deepEqual(cancelled.rows[0], { state: 'cancelled', lease_token: null });
    } finally {
      await client.query('RESET search_path');
      if (!/^karwan_cre_queue_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
