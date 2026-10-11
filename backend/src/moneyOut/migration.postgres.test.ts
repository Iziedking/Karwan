import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS } from '../db/migrations.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('an address is saved once while live, and can be saved again after removal', { skip: !testDatabaseUrl }, async () => {
  const schema = `money_out_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^money_out_[a-f0-9]{32}$/);
  const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, options: `-c search_path=${schema}`, max: 1 });
  try {
    await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === 'money_out_guard')!.sql);
    const add = (id: string) =>
      pool.query(
        `INSERT INTO money_out_addresses_v1 (id, wallet, chain, address, added_at, opens_at)
         VALUES ($1, '0xaa', 'arc', '0xbb', 1, 2)`,
        [id],
      );
    await add('first');
    await assert.rejects(() => add('second'), (err: { code?: string }) => err.code === '23505');
    await pool.query(`UPDATE money_out_addresses_v1 SET removed_at = 3 WHERE id = 'first'`);
    await add('third');

    await pool.query(`INSERT INTO money_out_spend_v1 (reference, wallet, amount_micros, at) VALUES ('r1', '0xaa', 5, 1)`);
    await assert.rejects(
      () => pool.query(`INSERT INTO money_out_spend_v1 (reference, wallet, amount_micros, at) VALUES ('r1', '0xaa', 5, 1)`),
      (err: { code?: string }) => err.code === '23505',
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO world_id_account_checks_v1 (rp_id, environment, nonce, wallet, purpose, request, expires_at)
           VALUES ('rp', 'staging', 'n1', '0xaa', 'withdraw', '{}'::jsonb, 1)`,
        ),
      (err: { code?: string }) => err.code === '23514',
    );
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
