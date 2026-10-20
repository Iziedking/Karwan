import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import pg from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test(
  'Postgres keeps conversations per account, caps them at 50 and never lets another account touch one',
  { skip: !testDatabaseUrl },
  async () => {
    const admin = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
    const schema = `karwan_conversations_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedUrl = new URL(testDatabaseUrl!);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = scopedUrl.toString();

    const client = await import('./client.js');
    const store = await import('./assistantConversations.js');

    try {
      await client.ensureSchema();
      const first = await store.appendToConversation('0xA', null, [{ role: 'user', content: 'first' }]);
      for (let i = 0; i < 50; i++) await store.appendToConversation('0xa', null, [{ role: 'user', content: `c${i}` }]);
      const list = await store.listConversations('0xA');
      assert.equal(list.length, 50);
      assert.ok(!list.some((c) => c.id === first.id));
      const kept = list[0]!;
      assert.equal(await store.getConversation('0xB', kept.id), null);
      await assert.rejects(store.appendToConversation('0xB', kept.id, [{ role: 'user', content: 'x' }]), /not_found/);
      assert.equal(await store.deleteConversation('0xB', kept.id), false);
      assert.equal(await store.deleteConversation('0xA', kept.id), true);
      await store.deleteConversationsOf('0xA');
      assert.deepEqual(await store.listConversations('0xA'), []);
    } finally {
      await client.closePostgresPool();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
