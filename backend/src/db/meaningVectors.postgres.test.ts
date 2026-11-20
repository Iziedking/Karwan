import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from './migrations.js';
import { meaningVectorSql } from './meaningVectors.js';

/// The meaning vectors table on a real Postgres (view 95 phase 2). Skipped
/// without TEST_DATABASE_URL.

const databaseUrl = process.env.TEST_DATABASE_URL;

test('meaning vectors round-trip, replace, list by model and delete by owner on Postgres', { skip: !databaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const schema = `karwan_meaning_${randomUUID().replaceAll('-', '')}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await runNumberedMigrations(client);
    const sql = meaningVectorSql(client);
    const base = { kind: 'seller' as const, ref: '0xaaa', model: 'm@3', owner: '0xaaa', textHash: 'h1', vector: Float32Array.from([0.125, -0.5, 0.333]), updatedAt: 1 };
    await sql.put(base);
    const got = await sql.get('seller', '0xaaa', 'm@3');
    assert.ok(got);
    got.vector.forEach((x, i) => assert.ok(Math.abs(x - base.vector[i]!) < 1e-6));
    await sql.put({ ...base, textHash: 'h2', updatedAt: 2 });
    assert.equal((await sql.get('seller', '0xaaa', 'm@3'))?.textHash, 'h2');
    await sql.put({ ...base, ref: '0xbbb', owner: '0xbbb', model: 'old@3' });
    await sql.put({ ...base, kind: 'request', ref: 'job-1' });
    assert.deepEqual((await sql.list('seller', 'm@3')).map((x) => x.ref), ['0xaaa']);
    assert.equal(await sql.count('seller', 'm@3'), 1);
    assert.equal(await sql.deleteOwner('0xaaa'), 2);
    assert.equal(await sql.get('request', 'job-1', 'm@3'), null);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    client.release();
    await pool.end();
  }
});
