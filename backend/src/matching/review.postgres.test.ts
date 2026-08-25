import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresMatchingAuditReviewStore } from './review.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres matching review ledger is durable, immutable, and idempotent',
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
    const schema = `karwan_matching_review_${randomUUID().replaceAll('-', '')}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      await client.query(
        `INSERT INTO matching_engine_audits_v2 (
           observation_key, source, mandate_id, mandate_version,
           legacy_winner_id, shadow_winner_id, comparison_status,
           candidate_count, observed_at, data
         ) VALUES ('observation-1', 'buyer-bids', 'mandate-1', 1,
                   'seller-legacy', 'seller-shadow', 'diverged', 2, 100, $1)`,
        [{ observationKey: 'observation-1' }],
      );
      const store = new PostgresMatchingAuditReviewStore(client);
      const first = await store.record({
        reviewId: 'review-1', observationKey: 'observation-1',
        decision: 'retain_legacy', reviewer: 'operator-1', createdAt: 200,
      });
      assert.equal(first.observationKey, 'observation-1');
      assert.deepEqual(
        await store.record({ ...first, createdAt: 999 }),
        first,
      );
      await assert.rejects(
        () => store.record({ ...first, decision: 'accept_shadow', createdAt: 201 }),
        /matching review id conflict|matching review conflict/,
      );
      assert.deepEqual(await store.list({ observationKey: 'observation-1' }), [first]);
      await assert.rejects(
        () => store.record({
          reviewId: 'review-2', observationKey: 'observation-1',
          decision: 'needs_more_evidence', reviewer: 'operator-1', createdAt: 202,
        }),
        /matching review conflict/,
      );
    } finally {
      if (!/^karwan_matching_review_[a-f0-9]{32}$/.test(schema)) {
        throw new Error(`refusing to drop unexpected schema ${schema}`);
      }
      await client.query('RESET search_path');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
