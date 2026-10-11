import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { checkAccountStores } from './storesContract.js';

const url = process.env.TEST_DATABASE_URL;

test('each account store deletes one account and leaves the next one whole (Postgres)', { skip: !url }, async () => {
  const schema = `account_stores_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  // The stores read DATABASE_URL when first imported, so it is set before any
  // of them loads; the schema keeps this run apart from every other test.
  const scoped = new URL(url!);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = scoped.toString();
  try {
    const client = await import('../db/client.js');
    assert.equal(client.pgEnabled, true, 'the stores run on Postgres here');
    await client.ensureSchema();
    await checkAccountStores();
  } finally {
    const client = await import('../db/client.js');
    await client.closePostgresPool();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
