import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import { runNumberedMigrations } from '../db/migrations.js';
import { postgresLeaseStore, runLeasedTick } from './watcherLease.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const T0 = 1_800_000_000_000;

/// Two processes, each with its own connection, against one database.
test('Postgres: two processes race for one job and one deal, exactly one wins each', { skip: !testDatabaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
  const schema = `karwan_leases_${randomUUID().replaceAll('-', '')}`;
  const setup = await pool.connect();
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`);
    await setup.query(`SET search_path TO "${schema}"`);
    await runNumberedMigrations(setup);
    for (const c of [a, b]) await c.query(`SET search_path TO "${schema}"`);
    const storeA = postgresLeaseStore(a);
    const storeB = postgresLeaseStore(b);

    for (let i = 0; i < 20; i++) {
      const name = `job-${i}`;
      const [ta, tb] = await Promise.all([storeA.take(name, 'a', 120_000, T0), storeB.take(name, 'b', 120_000, T0)]);
      assert.equal(Number(ta) + Number(tb), 1, `exactly one holder for ${name}`);
      const [ca, cb] = await Promise.all([
        storeA.claim(`deal:${i}`, 'a', 600_000, T0),
        storeB.claim(`deal:${i}`, 'b', 600_000, T0),
      ]);
      assert.equal(Number(ca) + Number(cb), 1, `exactly one claim on deal:${i}`);
    }

    const ran: string[] = [];
    const tickAs = (store: typeof storeA, holder: string, at: number) =>
      runLeasedTick({ store, name: 'dealWatcher', holder, ttlMs: 120_000, now: () => at, tick: () => void ran.push(holder) });
    assert.equal(await tickAs(storeA, 'a', T0), true);
    assert.equal(await tickAs(storeB, 'b', T0 + 60_000), false);
    assert.equal(await tickAs(storeA, 'a', T0 + 60_000), true, 'the holder renews');
    // 'a' is killed: its lease runs out 120s after its last renewal.
    assert.equal(await tickAs(storeB, 'b', T0 + 179_999), false);
    assert.equal(await tickAs(storeB, 'b', T0 + 180_000), true);
    assert.deepEqual(ran, ['a', 'a', 'b']);

    await storeB.drop('dealWatcher', 'a');
    assert.equal((await storeA.leases()).find((l) => l.name === 'dealWatcher')?.holder, 'b', 'only the holder drops');
    await storeB.drop('dealWatcher', 'b');
    assert.equal(await storeA.take('dealWatcher', 'a', 120_000, T0 + 180_001), true, 'a dropped lease is free at once');

    assert.equal(await storeA.claim('deal:x', 'a', 600_000, T0), true);
    assert.equal(await storeB.claim('deal:x', 'b', 600_000, T0 + 599_999), false);
    assert.equal(await storeB.claim('deal:x', 'b', 600_000, T0 + 600_000), true, 'a dead process\'s claim expires');
    await storeA.unclaim('deal:x', 'a');
    assert.equal(await storeA.claim('deal:x', 'a', 600_000, T0 + 600_001), false, 'only the holder unclaims');
  } finally {
    await setup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    setup.release();
    a.release();
    b.release();
    await pool.end();
  }
});
