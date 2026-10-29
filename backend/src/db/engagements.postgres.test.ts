import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';
import type { Engagement } from './engagements.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const HIRER = '0x1111111111111111111111111111111111111111';
const WORKER = '0x2222222222222222222222222222222222222222';

const row = (id: string, over: Partial<Engagement> = {}): Engagement => ({
  id, salt: `0x${'0'.repeat(64)}`, kind: 'hourly', hirer: HIRER, hirerAgent: HIRER, worker: WORKER, workerAgent: WORKER,
  title: 'Virtual assistant', brief: 'Inbox and calendar', rateMicros: '15000000', maxHours: 20, periods: 2,
  startsAt: Date.now() + 86_400_000, feeBps: 100, termsHash: `0x${'1'.repeat(64)}`, terms: {} as Engagement['terms'],
  status: 'offered', weeks: [], tx: {}, createdAt: Date.now(), updatedAt: Date.now(), ...over,
});

// The memory store runs the same checks through the core's tests; importing it
// here first would load the database client before the scoped URL is set.
for (const name of ['Postgres'] as const) {
  test(`${name} keeps engagements: both sides see them, a stale status never moves, finished means paid`, { skip: !testDatabaseUrl }, async () => {
    let cleanup = async () => {};
    {
      const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
      const schema = `karwan_work_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const scoped = new URL(testDatabaseUrl!);
      scoped.searchParams.set('options', `-c search_path=${schema}`);
      process.env.DATABASE_URL = scoped.toString();
      const client = await import('./client.js');
      await client.ensureSchema();
      cleanup = async () => {
        await client.closePostgresPool();
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      };
    }
    try {
      const store = (await import('./engagements.js')).postgresEngagementsStore();
      await store.create(row('w_1'));
      await store.create(row('w_2', { status: 'closed', weeks: [{ k: 0, fundedMicros: '1', loggedMinutes: 0, approvedMinutes: 0, objectedMinutes: 0, log: [], status: 'settled', paidNetMicros: '0' }] }));
      assert.equal((await store.listFor(HIRER.toUpperCase().replace('0X', '0x'))).length, 2);
      assert.equal((await store.listFor(WORKER)).length, 2);
      assert.deepEqual((await store.listLive()).map((e) => e.id), ['w_1']);

      assert.ok(await store.patchIfStatus('w_1', ['offered'], { status: 'active' }));
      assert.equal(await store.patchIfStatus('w_1', ['offered'], { status: 'cancelled' }), null, 'a second tap finds it moved on');
      assert.equal((await store.get('w_1'))?.status, 'active');

      assert.equal(await store.hasFinished(WORKER), false, 'closed with nothing paid is not finished work');
      await store.patch('w_2', { weeks: [{ k: 0, fundedMicros: '1', loggedMinutes: 60, approvedMinutes: 60, objectedMinutes: 0, log: [], status: 'settled', paidNetMicros: '14925000' }] });
      assert.equal(await store.hasFinished(WORKER), true);
    } finally {
      await cleanup();
    }
  });
}
