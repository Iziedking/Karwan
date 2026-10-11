import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import { forgetWorldIdSessions, releasePersonCheckNullifiers } from './worldId.js';

const url = process.env.TEST_DATABASE_URL;

test('World ID rows of a deleted account go, and only its own', { skip: !url }, async () => {
  const schema = `deletion_world_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
  try {
    for (const name of ['world_id_proof_nullifiers', 'world_id_deal_sessions', 'money_out_guard']) {
      const m = NUMBERED_MIGRATIONS.find((x) => x.name === name);
      assert.ok(m, `migration ${name} exists`);
      await pool.query(m.sql);
    }
    const transaction = async <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn({ query: (sql, params) => client.query(sql, params ? [...params] : []) });
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    };
    const alice = `0x${'a'.repeat(40)}`;
    const bob = `0x${'b'.repeat(40)}`;
    for (const [wallet, session] of [[alice, 's-a'], [bob, 's-b']]) {
      await pool.query(`INSERT INTO world_id_sessions_v1 VALUES ('rp', 'staging', $1, $2, 1)`, [wallet, session]);
      await pool.query(
        `INSERT INTO world_id_account_checks_v1 (rp_id, environment, nonce, wallet, purpose, request, expires_at)
         VALUES ('rp', 'staging', $1, $2, 'enrol', '{}', 1)`,
        [`n-${session}`, wallet],
      );
    }
    for (const [n, action] of [['0x10', 'person'], ['17', 'person'], ['16', 'other'], ['99', 'person']]) {
      await pool.query(`INSERT INTO world_id_nullifiers_v1 VALUES ($1::numeric, $2, 'staging', 1)`, [BigInt(n!).toString(), action]);
    }

    await forgetWorldIdSessions(transaction, alice.toUpperCase().replace('0X', '0x'));
    const sessions = await pool.query('SELECT wallet FROM world_id_sessions_v1');
    assert.deepEqual(sessions.rows.map((r) => r.wallet), [bob]);
    const checks = await pool.query('SELECT wallet FROM world_id_account_checks_v1');
    assert.deepEqual(checks.rows.map((r) => r.wallet), [bob]);

    await releasePersonCheckNullifiers(transaction, ['0x10', '17', 'not-a-number'], 'person');
    const left = await pool.query('SELECT nullifier::text AS n, action FROM world_id_nullifiers_v1 ORDER BY 1, 2');
    assert.deepEqual(left.rows, [{ n: '16', action: 'other' }, { n: '99', action: 'person' }], 'only those hashes, only for the person check');
    await releasePersonCheckNullifiers(transaction, [], 'person');
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
