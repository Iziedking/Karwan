import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { progressChecks } from './agentProgressContract.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('Postgres progress log claims once, reads back and prunes', { skip: !testDatabaseUrl }, async () => {
  const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
  const schema = `karwan_progress_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const scoped = new URL(testDatabaseUrl!);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = scoped.toString();
  const client = await import('./client.js');
  try {
    await client.ensureSchema();
    const { postgresProgressStore } = await import('./agentProgress.js');
    await progressChecks(postgresProgressStore(client.postgresExecutor()));
  } finally {
    await client.closePostgresPool();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
