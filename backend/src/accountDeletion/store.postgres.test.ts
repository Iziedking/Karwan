import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { NUMBERED_MIGRATIONS, type SqlExecutor } from '../db/migrations.js';
import { createPostgresDeletionStore } from './store.js';
import { checkDeletionStore } from './storeContract.js';

const url = process.env.TEST_DATABASE_URL;

test('the Postgres deletion store behaves like the memory one', { skip: !url }, async () => {
  const schema = `account_deletion_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}`, max: 2 });
  try {
    await pool.query(NUMBERED_MIGRATIONS.find((m) => m.name === 'account_deletions')!.sql);
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
    await checkDeletionStore(createPostgresDeletionStore(transaction));
  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
