import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { leaseChecks } from './requestLeasesContract.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('Postgres lease store: one holder at a time, and two claims at once give one winner', { skip: !testDatabaseUrl }, async () => {
  const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
  const schema = `karwan_lease_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const scoped = new URL(testDatabaseUrl!);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = scoped.toString();
  const client = await import('./client.js');
  try {
    await client.ensureSchema();
    const { postgresRequestLeaseStore } = await import('./requestLeases.js');
    const store = postgresRequestLeaseStore(client.postgresExecutor());
    await leaseChecks(store);

    const T = 1_900_000_000_000;
    const owners = Array.from({ length: 8 }, (_, i) => `server-${i}`);
    const won = await Promise.all(owners.map((o) => store.claim('0xRACE', o, T, 90_000)));
    assert.equal(won.filter(Boolean).length, 1, 'eight servers claim together and one holds it');
  } finally {
    await client.closePostgresPool();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
