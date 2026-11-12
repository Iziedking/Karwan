import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres keeps cases with running references, leaves notes out for the person and deletes a person\'s cases',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_cases_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('../db/client.js');
    const { postgresCaseStore } = await import('./cases.js');
    const now = Date.parse('2026-11-12T10:00:00+01:00');

    try {
      await client.ensureSchema();
      const store = postgresCaseStore(client.postgresExecutor(), 'mainnet');
      const base = { contactVerified: true, kind: 'money_in_deal' as const, channel: 'web' as const, text: 'stuck', role: 'person' as const, now };
      const a = await store.open({ ...base, address: '0xabc', records: [{ kind: 'deal', id: 'd1' }], legacyId: 'KSUP-0011223344' });
      const b = await store.open({ ...base, address: '0xdef', records: [] });
      assert.equal(a.ref, 'KS-1001');
      assert.equal(b.ref, 'KS-1002');
      assert.equal((await store.byLegacyId('KSUP-0011223344'))?.id, a.id);

      await store.add(a.id, { role: 'note', memberId: 'm1', channel: 'desk', text: 'internal', at: now + 1 });
      await store.add(a.id, { role: 'teammate', memberId: 'm1', channel: 'desk', text: 'On it', at: now + 2 });
      assert.equal((await store.messages(a.id, { forPerson: true })).length, 2);
      assert.equal((await store.messages(a.id, { forPerson: false })).length, 3);
      const after = await store.get('KS-1001');
      assert.equal(after?.state, 'waiting_person');
      assert.equal(after?.firstRepliedAt, now + 2);

      assert.deepEqual((await store.queue({})).map((c) => c.ref), ['KS-1001', 'KS-1002']);
      assert.equal(await store.deleteFor('0xABC'), 1);
      assert.equal(await store.get('KS-1001'), null);
      assert.deepEqual(await store.messages(a.id, { forPerson: false }), []);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
