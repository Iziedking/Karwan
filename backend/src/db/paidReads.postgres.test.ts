import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres adds each paid read to its endpoint and day and keeps the earliest time',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_paid_reads_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const { countPaidRead, paidReadTotals } = await import('./paidReads.js');
    const DAY = 86_400_000;

    try {
      await client.ensureSchema();
      assert.deepEqual(await paidReadTotals(), { reads: 0, since: null, byEndpoint: {} });

      await countPaidRead('credit-passport', 10 * DAY + 500);
      await countPaidRead('credit-passport', 10 * DAY + 100);
      await countPaidRead('credit-passport', 11 * DAY);
      await countPaidRead('record', 12 * DAY);

      assert.deepEqual(await paidReadTotals(), {
        reads: 4,
        since: 10 * DAY + 100,
        byEndpoint: { 'credit-passport': 3, record: 1 },
      });
      const { rows } = await admin.query(`SELECT endpoint, day, reads FROM "${schema}".paid_reads_v1 ORDER BY endpoint, day`);
      assert.deepEqual(
        rows.map((r) => [r.endpoint, r.day, r.reads]),
        [
          ['credit-passport', '1970-01-11', 2],
          ['credit-passport', '1970-01-12', 1],
          ['record', '1970-01-13', 1],
        ],
      );
      const { rows: cols } = await admin.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'paid_reads_v1' ORDER BY column_name`,
        [schema],
      );
      assert.deepEqual(cols.map((c) => c.column_name), ['day', 'endpoint', 'first_at', 'reads']);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
