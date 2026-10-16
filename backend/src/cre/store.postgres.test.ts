import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { fingerprint } from './shared/canonical.js';
import { REPLAY_POLICY } from './shared/policy.js';
import { CRE_STORE_SQL, createSqlCreStore } from './store.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('the Postgres CRE store keeps documents, rotates the replay index and summarises shadow results', { skip: !testDatabaseUrl }, async () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 2 });
  const schema = `karwan_cre_store_${randomUUID().replaceAll('-', '')}`;
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(CRE_STORE_SQL);
    const store = createSqlCreStore(client);
    const policy = {
      policy: REPLAY_POLICY,
      repository: { owner: 'acme', name: 'billing', id: 1 },
      baseBranch: 'main',
      delivery: 'pull',
      items: [{ id: 'a', title: 'A', run: 'npm test', required: true }],
      partialAt: null,
      runner: { repository: 'karwan-xyz/karwan-replay', workflow: '.github/workflows/replay.yml', blobSha: 'a'.repeat(40) },
      timeoutMinutes: 10,
    };
    const hash = await store.putDocument('policy', policy);
    assert.equal(hash, fingerprint(policy));
    assert.deepEqual((await store.getDocument(hash))?.body, policy);

    const deal = `0x${'d'.repeat(64)}`;
    for (const n of [1, 2, 3]) {
      await store.upsertCheckItem({ dealKey: `${deal}-r${n}`, kind: 'deal', family: '0xf', dealId: deal, revision: n, deliveredBlockHash: null, deliveredBlockNumber: 66_719_640 + n, policyHash: hash, referenceHash: null }, 1_000 + n);
    }
    assert.deepEqual((await store.pendingCheckItems(2, 2_000, 0)).map((i) => i.revision), [1, 2]);
    assert.deepEqual((await store.pendingCheckItems(1, 2_000, 0)).map((i) => i.deliveredBlockNumber), [66_719_641]);
    assert.deepEqual((await store.pendingCheckItems(2, 2_000, 2)).map((i) => i.revision), [3, 1]);
    await store.closeCheckItem(`${deal}-r1`, { decision: 'PASS' }, 2_000);
    assert.deepEqual((await store.pendingCheckItems(5, 2_001, 0)).map((i) => i.revision), [2, 3]);

    await store.recordShadow({ dealKey: 'k1', revision: 1, family: '0xf', creVerdict: 'PASS', karwanVerdict: 'PASS', evidenceHash: null }, 1);
    await store.recordShadow({ dealKey: 'k2', revision: 1, family: '0xf', creVerdict: 'FAIL', karwanVerdict: 'PASS', evidenceHash: null }, 1);
    const summary = await store.shadowSummary();
    assert.deepEqual({ compared: summary.compared, agreed: summary.agreed }, { compared: 2, agreed: 1 });
  } finally {
    await client.query(`DROP SCHEMA "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
});
