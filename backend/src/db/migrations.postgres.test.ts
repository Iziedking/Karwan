import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, runNumberedMigrations } from './migrations.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'numbered migrations apply twice on empty and representative Postgres schemas',
  { skip: !testDatabaseUrl },
  async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 1 });
    const suffix = randomUUID().replaceAll('-', '');
    const schemas = [`karwan_empty_${suffix}`, `karwan_representative_${suffix}`];
    try {
      for (const [index, schema] of schemas.entries()) {
        assert.match(schema, /^karwan_(empty|representative)_[a-f0-9]{32}$/);
        const client = await pool.connect();
        try {
          await client.query(`CREATE SCHEMA "${schema}"`);
          await client.query(`SET search_path TO "${schema}"`);
          if (index === 1) {
            await client.query(`
              CREATE TABLE profiles (address TEXT PRIMARY KEY, data JSONB NOT NULL);
              CREATE TABLE money_movements (
                reference TEXT PRIMARY KEY,
                operation_key TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                state TEXT NOT NULL,
                version BIGINT NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                data JSONB NOT NULL
              );
              CREATE TABLE event_history (
                type TEXT NOT NULL,
                job_id TEXT NOT NULL,
                ts BIGINT NOT NULL,
                data JSONB NOT NULL,
                PRIMARY KEY (type, job_id, ts)
              );
            `);
          }

          assert.deepEqual(await runNumberedMigrations(client), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
          assert.deepEqual(await runNumberedMigrations(client), []);
          const tables = await client.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = $1 ORDER BY table_name`,
            [schema],
          );
          const names = new Set(tables.rows.map((row) => row.table_name));
          for (const table of [
            'karwan_schema_migrations',
            'deal_rooms',
            'mandate_versions',
            'offers',
            'negotiation_attempts',
            'qualification_blockers',
            'evidence_needs',
            'agent_tasks',
            'decisions',
            'policy_decisions',
            'approvals',
            'domain_events_v2',
            'event_outbox_v2',
            'event_consumptions_v2',
            'notification_jobs_v2',
            'agent_task_checkpoints',
            'agent_task_triggers',
            'event_ingestion_cursors_v2',
            'event_ingestion_dedupe_v2',
            'buyer_runtime_snapshots_v2',
            'buyer_timer_parity_audits_v2',
            'negotiation_commands_v2',
            'evidence_purchases_v2',
            'evidence_snapshots_v2',
            'financial_commands_v2',
            'research_credit_accounts_v2',
            'research_credit_reservations_v2',
            'negotiation_command_conflicts_v2',
            'negotiation_mandates_v2',
            'matching_audit_reviews_v2',
            'match_proposal_revisions_v2',
            'agent_task_replays_v2',
            'agentkit_research_allowances_v1',
            'agentkit_used_nonces_v1',
            'agentkit_bindings_v1',
            'deal_invites_v1',
          ]) {
            assert.equal(names.has(table), true, `${schema} is missing ${table}`);
          }
          const ledger = await client.query<{ version: string; name: string }>(
            'SELECT version, name FROM karwan_schema_migrations ORDER BY version',
          );
          assert.deepEqual(
            ledger.rows.map((row) => ({ version: Number(row.version), name: row.name })),
            NUMBERED_MIGRATIONS.map(({ version, name }) => ({ version, name })),
          );
        } finally {
          client.release();
        }
      }
    } finally {
      const client = await pool.connect();
      try {
        for (const schema of schemas) {
          if (!/^karwan_(empty|representative)_[a-f0-9]{32}$/.test(schema)) {
            throw new Error(`refusing to drop unexpected schema ${schema}`);
          }
          await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        }
      } finally {
        client.release();
        await pool.end();
      }
    }
  },
);
