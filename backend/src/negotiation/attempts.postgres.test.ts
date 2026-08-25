import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { PostgresNegotiationAttemptStore } from './attempts.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres attempt store deduplicates re-entry keys and fences state updates',
  { skip: !databaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const schema = `karwan_attempts_${randomUUID().replaceAll('-', '')}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await runNumberedMigrations(client);
      await client.query(
        `INSERT INTO deal_rooms (id, job_id, state, version, created_at, updated_at, data)
         VALUES ('room-1', 'job-1', 'open', 1, 100, 100, '{}'::jsonb)`,
      );
      const store = new PostgresNegotiationAttemptStore(client);
      const input = { id: 'attempt-1', dealRoomId: 'room-1', attemptNumber: 1, trigger: 'INITIAL_MATCH' as const, triggerReference: 'match-1', strategy: { objective: 'scope' }, now: 100 };
      const first = await store.create(input);
      const duplicate = await store.create({ ...input, id: 'attempt-duplicate', now: 200 });
      assert.equal(duplicate.id, first.id);
      const running = await store.update(first.id, 1, 'running', undefined, 300);
      assert.equal(running.version, 2);
      assert.equal((await store.list('room-1')).length, 1);
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);
